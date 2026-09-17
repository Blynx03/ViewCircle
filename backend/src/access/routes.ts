import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ServiceError } from '../services/session-service.js';
import { accessStore } from './store.js';
import { notifyOwner, pushConfigured } from './push.js';

const hour = 3_600_000;
const secret = env.OWNER_SESSION_SECRET || randomBytes(32).toString('hex');
export const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const cookieOptions = () => ({ httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api' });
function cookie(request: Request, name: string): string {
  const value: unknown = request.cookies?.[name];
  return typeof value === 'string' && value.length <= 128 ? value : '';
}
export const ownerSession = (request: Request) => accessStore.findOwner(digest(cookie(request, 'vc_owner')));
export const visitorRequest = (request: Request) => accessStore.findVisitor(digest(cookie(request, 'vc_visitor')));
export const requireOwner: RequestHandler = async (request, _response, next) => {
  if (!await ownerSession(request)) return next(new ServiceError('OWNER_REQUIRED', 'Owner login is required.', 401));
  next();
};
export const requireAccess: RequestHandler = async (request, response, next) => {
  const owner = await ownerSession(request);
  const visitor = owner ? undefined : await visitorRequest(request);
  if (!owner && visitor?.status !== 'approved') return next(new ServiceError('ACCESS_REQUIRED', 'Owner approval is required.', 403));
  response.locals.access = owner ? { kind: 'owner', id: digest(cookie(request, 'vc_owner')) } : { kind: 'visitor', id: visitor!.id };
  next();
};
// The custom header cannot be sent by cross-site HTML forms. Strict Origin checks
// also cover same-site sibling origins; no Origin is allowed only for non-browser clients.
export const csrfProtection: RequestHandler = (request, _response, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      (request.get('X-ViewCircle-Request') !== '1' ||
       (request.get('Origin') && request.get('Origin') !== new URL(env.CLIENT_URL).origin) ||
       request.get('Sec-Fetch-Site') === 'cross-site')) {
    return next(new ServiceError('CSRF_REJECTED', 'Request origin is not allowed.', 403));
  }
  next();
};
const limited = (limit: number, windowMs: number, extra = {}) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } }, ...extra
});
const router = Router();
router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
const ok = (response: Response, data: unknown) => response.json({ success: true, data });
router.get('/access', async (request, response) => {
  const owner = await ownerSession(request); const visitor = await visitorRequest(request);
  ok(response, { authorized: Boolean(owner || visitor?.status === 'approved'), owner: Boolean(owner),
    expiresAt: owner?.expiresAt ?? (visitor?.status === 'approved' ? visitor.expiresAt : undefined),
    request: visitor ? { id: visitor.id, status: visitor.status, expiresAt: visitor.expiresAt } : null });
});
router.post('/access-requests', limited(env.ACCESS_REQUEST_MAX_PER_HOUR, hour),
  limited(env.ACCESS_REQUEST_GLOBAL_MAX_PER_HOUR, hour, { keyGenerator: () => 'global' }), async (request, response) => {
    const input = z.object({ name: z.string().trim().min(1).max(80), emailOrCompany: z.string().trim().max(160).optional() }).parse(request.body);
    const existing = await visitorRequest(request);
    if (existing && (['pending', 'approved'].includes(existing.status) || Date.now() < existing.createdAt + 5 * 60_000)) {
      throw new ServiceError('REQUEST_EXISTS', 'Please wait before requesting access again.', 429);
    }
    const browser = token(); const id = randomUUID(); const now = Date.now();
    await accessStore.createRequest({ ...input, id, status: 'pending', createdAt: now,
      expiresAt: now + env.ACCESS_REQUEST_TTL_MINUTES * 60_000, browserHash: digest(browser), creations: 0 });
    response.cookie('vc_visitor', browser, { ...cookieOptions(),
      maxAge: env.ACCESS_REQUEST_TTL_MINUTES * 60_000 + env.VISITOR_ACCESS_TTL_HOURS * hour });
    response.status(201); ok(response, { id, status: 'pending' });
    void notifyOwner(input.name, id).catch(() => undefined);
  });
router.get('/access-requests/:id/status', limited(30, 60_000), async (request, response) => {
  const item = await visitorRequest(request);
  if (!item || item.id !== request.params.id) throw new ServiceError('NOT_FOUND', 'Request not found.', 404);
  ok(response, { id: item.id, status: item.status, expiresAt: item.expiresAt });
});
// Rate limit every attempt, including concurrent attempts, before bcrypt work.
router.post('/owner/login', limited(env.OWNER_MAX_FAILED_LOGIN_ATTEMPTS, env.OWNER_LOGIN_LOCKOUT_MINUTES * 60_000, {
  skipSuccessfulRequests: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Invalid credentials.' } }
}), limited(50, 15 * 60_000, { keyGenerator: () => 'owner-global' }), async (request, response) => {
  const input = z.object({ username: z.string().max(160), password: z.string().max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72), rememberMe: z.boolean().default(false) }).parse(request.body);
  // Use a valid dummy hash to avoid a fast path for an unknown username.
  const valid = await bcrypt.compare(input.password, env.OWNER_PASSWORD_HASH || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5YfLkRWqweN4S9IM1KmvOBrQXoI9P7G');
  if (!env.OWNER_USERNAME || !env.OWNER_SESSION_SECRET || !valid || input.username !== env.OWNER_USERNAME) {
    throw new ServiceError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);
  }
  const value = token(); const maxAge = input.rememberMe ? env.OWNER_REMEMBER_ME_DAYS * 24 * hour : env.OWNER_SESSION_TTL_HOURS * hour;
  await accessStore.deleteOwner(digest(cookie(request, 'vc_owner')));
  await accessStore.putOwner(digest(value), { expiresAt: Date.now() + maxAge, creations: 0 });
  response.cookie('vc_owner', value, { ...cookieOptions(), ...(input.rememberMe ? { maxAge } : {}) });
  ok(response, { expiresAt: Date.now() + maxAge });
});
router.use('/owner', requireOwner);
router.post('/owner/logout', async (request, response) => {
  await accessStore.deleteOwner(digest(cookie(request, 'vc_owner')));
  response.clearCookie('vc_owner', cookieOptions()); ok(response, {});
});
router.get('/owner/access-requests', async (_request, response) => {
  const items = (await accessStore.listRequests()).slice(0, 100)
    .map(({ id, name, emailOrCompany, status, createdAt, approvedAt, deniedAt, expiresAt }) => ({ id, name, emailOrCompany, status, createdAt, approvedAt, deniedAt, expiresAt }));
  ok(response, items);
});
for (const action of ['approve', 'deny'] as const) router.post(`/owner/access-requests/:id/${action}`, async (request, response) => {
  const item = await accessStore.decide(String(request.params.id), action, env.VISITOR_ACCESS_TTL_HOURS * hour);
  ok(response, { status: item.status });
});
router.get('/owner/push-key', (_request, response) => ok(response, { publicKey: pushConfigured() ? env.VAPID_PUBLIC_KEY : null }));
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      (url.hostname === 'web.push.apple.com' || url.hostname === 'fcm.googleapis.com' || url.hostname.endsWith('.push.services.mozilla.com'));
  }, 'Unsupported push service.'),
  keys: z.object({ p256dh: z.string().regex(/^[\w-]+$/).length(87), auth: z.string().regex(/^[\w-]+$/).length(22) })
});
router.post('/owner/push-subscriptions', async (request, response) => {
  const subscription = subscriptionSchema.parse(request.body);
  const id = digest(subscription.endpoint);
  await accessStore.putSubscription(id, subscription); ok(response, {});
});
router.delete('/owner/push-subscriptions', async (request, response) => {
  const { endpoint } = z.object({ endpoint: z.string().max(2048) }).parse(request.body);
  await accessStore.deleteSubscription(digest(endpoint)); ok(response, {});
});
export default router;
