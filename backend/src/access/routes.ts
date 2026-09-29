import { sessionStore } from '../stores/session-store.js';
import { SessionService } from '../services/session-service.js';
import { endSession } from '../services/session-expiry.js';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { accessRequestProtection, AccessRequestThrottle } from './protection.js';
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
// Establish the opaque HttpOnly identity during the existing access check,
// before the user can submit. Retrying a lost POST response reuses this cookie.
function browserIdentity(request: Request, response: Response, knownVisitor: boolean) {
  const existing = cookie(request, 'vc_visitor');
  const parts = existing.split('.');
  const signed = /^[\w-]{43}\.[a-f0-9]{64}$/.test(existing) && timingSafeEqual(Buffer.from(parts[1]!, 'hex'), Buffer.from(digest(parts[0]!), 'hex'));
  // Keep existing legacy cookies only when bound to a real request. A new
  // identity must be server-signed, so callers cannot fix an arbitrary cookie.
  if (existing && (knownVisitor || signed)) return existing;
  const value = token(); const browser = `${value}.${digest(value)}`;
  response.cookie('vc_visitor', browser, { ...cookieOptions(),
    maxAge: env.ACCESS_REQUEST_TTL_MINUTES * 60_000 + env.VISITOR_ACCESS_TTL_HOURS * hour });
  return browser;
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
  browserIdentity(request, response, Boolean(visitor));
  ok(response, { authorized: Boolean(owner || visitor?.status === 'approved'), owner: Boolean(owner),
    ...(!owner && visitor?.status === 'approved' ? { requestorName: visitor.name } : {}),
    expiresAt: owner?.expiresAt ?? (visitor?.status === 'approved' ? visitor.expiresAt : undefined),
    request: visitor ? { id: visitor.id, status: visitor.status, expiresAt: visitor.expiresAt } : null });
});
router.post('/access-requests', async (request, response) => {
  if (await ownerSession(request)) { ok(response, { status: 'approved', authorized: true, message: 'Access already granted.' }); return; }
  const existing = await visitorRequest(request);
  const browser = browserIdentity(request, response, Boolean(existing));
  // Valid workflows bypass both input validation and creation throttles.
  if (existing && ['pending', 'approved'].includes(existing.status)) {
    ok(response, { id: existing.id, status: existing.status, expiresAt: existing.expiresAt,
      message: existing.status === 'pending' ? 'Your access request is already waiting for approval.' : 'Access already granted.' }); return;
  }
  const input = z.object({ name: z.string().trim().min(1).max(80), emailOrCompany: z.string().trim().max(160).optional() }).parse(request.body);
  const now = Date.now();
  try {
    const result = await accessStore.createOrReuseRequest({ ...input, id: randomUUID(), status: 'pending', createdAt: now,
      expiresAt: now + env.ACCESS_REQUEST_TTL_MINUTES * 60_000, browserHash: digest(browser), creations: 0 },
    () => accessRequestProtection.consume(digest(browser), digest(ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? 'unknown'))));
    const item = result.item;
    // Refresh only on a genuinely new workflow, never on polling or reuse.
    if (result.created) response.cookie('vc_visitor', browser, { ...cookieOptions(),
      maxAge: env.ACCESS_REQUEST_TTL_MINUTES * 60_000 + env.VISITOR_ACCESS_TTL_HOURS * hour });
    response.status(result.created ? 201 : 200);
    ok(response, { id: item.id, status: item.status, expiresAt: item.expiresAt,
      message: item.status === 'approved' ? 'Access already granted.' : result.created ? 'Access request sent.' : 'Your access request is already waiting for approval.' });
    if (result.created) void notifyOwner(item.name, item.id).catch(() => undefined);
  } catch (error) {
    if (!(error instanceof AccessRequestThrottle)) throw error;
    response.set('Retry-After', String(error.retryAfterSeconds)).status(429).json({ success: false,
      error: { code: 'ACCESS_REQUEST_THROTTLED', message: error.message, retryAfterSeconds: error.retryAfterSeconds } });
  }
});
router.get('/access-requests/:id/status', async (request, response) => {
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
router.get('/owner/access-request-protection', (_request, response) => ok(response, accessRequestProtection.status()));
router.post('/owner/access-request-protection/reset', (_request, response) => { accessRequestProtection.reset(); ok(response, accessRequestProtection.status()); });
router.get('/owner/sessions', (_request, response) => {
  const service = new SessionService(sessionStore);
  ok(response, { capacity: 2, sessions: sessionStore.all().filter(s => s.status !== 'ENDED').map(s => ({ ...service.publicView(s), pendingRequests: [...s.requests?.values() ?? []].filter(r => r.status === 'pending' && r.expiresAt > Date.now()).length })) });
});
router.post('/owner/sessions/end-all', async (_request, response) => {
  const results = await Promise.allSettled(sessionStore.all().filter(s => s.status !== 'ENDED').map(s => endSession(s, 'The Owner ended the session.')));
  if (results.some(r => r.status === 'rejected')) throw new ServiceError('CLEANUP_PENDING', 'Some sessions are still closing. Cleanup will retry automatically.', 503);
  ok(response, {});
});
router.post('/owner/sessions/:code/end', async (request, response) => {
  const session = await sessionStore.find(String(request.params.code));
  if (session) await endSession(session, 'The Owner ended the session.');
  ok(response, {});
});
router.post('/owner/reset-creations', async (_request, response) => { await accessStore.resetCreations(); ok(response, {}); });
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
