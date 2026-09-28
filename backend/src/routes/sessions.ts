import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createSecret, hashAuthority } from '../utilities/security.js';
import { endSession, reconcileSession, lifecycleReason } from '../services/session-expiry.js';
import { requireAccess } from '../access/routes.js';
import { accessStore, type AccessIdentity } from '../access/store.js';
import { Router } from 'express';
import { TokenVerifier } from 'livekit-server-sdk';
import rateLimit from 'express-rate-limit';
import { sessionStore } from '../stores/session-store.js';
import { ServiceError, SessionService } from '../services/session-service.js';
import { provisionRoom, expireRoom, removeParticipant } from '../services/livekit-service.js';
import { createSessionSchema, joinSessionSchema, lockSchema, participantSchema, roomCodeSchema } from '../validation/session.js';
import { env } from '../config/env.js';

const router = Router();
const service = new SessionService(sessionStore);
const guestVerifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
const limiter = (max: number) => rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } }, skip: () => env.NODE_ENV === 'test' });
const authority = (request: { cookies?: Record<string, unknown> }): string | undefined => {
  const value = request.cookies?.vc_host;
  return typeof value === 'string' ? value : undefined;
};

const accessKey = (access: AccessIdentity) => access.kind === 'owner' ? 'owner:primary' : `visitor:${access.id}`;
const activeFor = (access: AccessIdentity) => sessionStore.all().find(s => s.status !== 'ENDED' && s.accessKey === accessKey(access));
const creations = new Set<string>();
const admissions = new Map<string, Promise<{ token: string; identity: string }>>();
router.get('/active', requireAccess, async (_request, response) => {
  const session = activeFor(response.locals.access as AccessIdentity);
  if (session) await reconcileSession(session);
  response.json({ success: true, data: session && session.status !== 'ENDED' ? service.publicView(session) : null });
});
router.post('/recover', requireAccess, (_request, response) => {
  const session = activeFor(response.locals.access as AccessIdentity);
  if (session?.provisioning) throw new ServiceError('SESSION_PREPARING', 'Your session is still being prepared. Please wait a moment.', 409);
  if (!session || ['EXPIRED', 'ENDED'].includes(session.status)) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
  const value = createSecret(); session.hostAuthorityHash = hashAuthority(value);
  response.cookie('vc_host', value, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: `/api/sessions/${session.roomCode}` });
  response.json({ success: true, data: service.publicView(session) });
});
router.get('/available', limiter(60), (_request, response) => {
  response.json({ success: true, data: sessionStore.all().filter(s => s.visibility === 'public' && !s.provisioning && !['ENDED', 'EXPIRED'].includes(s.status) && !s.locked && Date.now() < s.createdAt.getTime() + 180 * 60_000).map(s => ({ id: s.discoveryId, label: s.sessionName || `${s.hostName}'s session`, status: 'Waiting for guests' })) });
});
router.post('/', requireAccess, limiter(10), async (request, response) => {
  if (request.app.locals.sessionRecoveryPending) throw new ServiceError('RECOVERY_PENDING', 'Session recovery is in progress. Please try again shortly.', 503);
  const input = createSessionSchema.parse(request.body);
  const access = response.locals.access as AccessIdentity;
  const key = accessKey(access);
  if (creations.has(key)) throw new ServiceError('CREATION_PENDING', 'A session is already being created. Please wait.', 409);
  creations.add(key);
  try {
    for (const room of sessionStore.all()) { const reason = lifecycleReason(room, Date.now()); if (room.status !== 'ENDED' && reason) await reconcileSession(room); }
    const old = activeFor(access);
    if (old) {
      if (!input.replace) { response.status(409).json({ success: false, error: { code: 'ACTIVE_SESSION_EXISTS', message: 'You already have an active session.', session: service.publicView(old) } }); return; }
      await endSession(old, 'The Host started a new session.');
    }
    const reservation = await accessStore.reserveCreation(access, env.DEMO_MAX_SESSION_CREATIONS_PER_ACCESS);
    let created;
    try {
      created = await service.create(input, key);
      await provisionRoom(created.session.roomCode);
      if (['ENDED', 'EXPIRED'].includes(created.session.status)) { await expireRoom(created.session.roomCode); throw new ServiceError('SESSION_ENDED', 'Session creation was canceled.', 409); }
    } catch (error) {
      if (created) await endSession(created.session, 'Session setup did not complete.').catch(() => undefined);
      await accessStore.releaseCreation(access, reservation); throw error;
    }
    created.session.provisioning = false;
    response.cookie('vc_host', created.authority, {
      httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000,
      path: `/api/sessions/${created.session.roomCode}`
    });
    response.status(201).json({ success: true, data: service.publicView(created.session) });
  } finally { creations.delete(key); }
});
const requestInput = z.object({ name: z.string().trim().min(1).max(40), secret: z.string().min(32).max(128) });
router.post('/available/:id/requests', limiter(12), (request, response) => {
  const session = sessionStore.all().find(s => s.discoveryId === request.params.id && s.visibility === 'public');
  if (!session || session.provisioning || ['ENDED', 'EXPIRED'].includes(session.status) || session.locked) throw new ServiceError('SESSION_ENDED', 'This session is no longer available.', 410);
  const input = requestInput.parse(request.body); const now = Date.now();
  const secretHash = hashAuthority(input.secret);
  const existing = [...session.requests!.values()].find(r => r.secretHash === secretHash && r.expiresAt > now);
  if (existing) { response.json({ success: true, data: { id: existing.id, roomCode: session.roomCode } }); return; }
  for (const [id, item] of session.requests!) if (item.expiresAt <= now) session.requests!.delete(id);
  if (session.requests!.size >= 20) throw new ServiceError('REQUEST_LIMIT', 'The Host has several requests waiting. Please try again shortly.', 429);
  const id = randomUUID(); session.requests!.set(id, { id, name: input.name, secretHash, status: 'pending', expiresAt: now + 120_000 });
  response.json({ success: true, data: { id, roomCode: session.roomCode } });
});
router.post('/:roomCode/requests/:id/status', limiter(600), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const session = await service.requireSession(roomCode);
  const { secret, cancel } = z.object({ secret: z.string().max(128), cancel: z.boolean().optional() }).parse(request.body);
  const item = session.requests?.get(String(request.params.id));
  if (!item || item.secretHash !== hashAuthority(secret) || item.expiresAt <= Date.now() || ['ENDED', 'EXPIRED'].includes(session.status)) throw new ServiceError('REQUEST_EXPIRED', 'This request has ended. Please request access again.', 410);
  if (cancel) { session.requests!.delete(item.id); response.json({ success: true, data: { status: 'denied' } }); return; }
  if (item.status === 'allowed' && !item.credentials) {
    let issuing = admissions.get(item.id);
    if (!issuing) { issuing = service.join(session, item.name, undefined, true); admissions.set(item.id, issuing); }
    try { item.credentials = await issuing; } finally { admissions.delete(item.id); }
  }
  if (['ENDED', 'EXPIRED'].includes(session.status)) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
  response.json({ success: true, data: { status: item.status, ...(item.credentials ? { credentials: { ...item.credentials, livekitUrl: env.LIVEKIT_URL } } : {}) } });
});
router.post('/:roomCode/camera-state', limiter(60), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params); const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  const { available } = z.object({ available: z.boolean() }).parse(request.body);
  if (!available) { session.cameraReportedLost = true; session.cameraMissingSince ??= Date.now(); } else { session.cameraReportedLost = false; }
  response.json({ success: true, data: {} });
});
router.get('/:roomCode/requests', limiter(60), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params); const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  response.json({ success: true, data: [...session.requests?.values() ?? []].filter(r => r.status === 'pending' && r.expiresAt > Date.now()).map(({ id, name }) => ({ id, name })) });
});
router.post('/:roomCode/requests/decide', limiter(60), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params); const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  if (['ENDED', 'EXPIRED'].includes(session.status)) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
  const { ids, allow } = z.object({ ids: z.array(z.string()).max(20), allow: z.boolean() }).parse(request.body);
  // Explicit IDs are the Host's snapshot; future arrivals cannot be admitted.
  for (const id of ids) { const item = session.requests?.get(id); if (item?.status === 'pending' && item.expiresAt > Date.now()) item.status = allow ? 'allowed' : 'denied'; }
  response.json({ success: true, data: {} });
});
router.post('/:roomCode/keep-waiting', limiter(10), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params); const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  if (!session.everJoined && !['ENDED', 'EXPIRED'].includes(session.status) && Date.now() < session.createdAt.getTime() + 330_000 + (session.pendingExtension ?? 0)) session.keepWaiting = true;
  response.json({ success: true, data: service.publicView(session) });
});

router.get('/:roomCode/public', limiter(600), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  response.json({ success: true, data: service.publicView(await service.requireSession(roomCode)) });
});

router.post('/:roomCode/join', limiter(12), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const input = joinSessionSchema.parse(request.body);
  const result = await service.join(await service.requireSession(roomCode), input.name, input.pin);
  response.json({ success: true, data: { ...result, livekitUrl: env.LIVEKIT_URL } });
});

router.post('/:roomCode/host-token', limiter(20), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const result = await service.hostToken(await service.requireSession(roomCode), authority(request));
  response.json({ success: true, data: { ...result, livekitUrl: env.LIVEKIT_URL } });
});

router.post('/:roomCode/lock', limiter(30), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  const { locked } = lockSchema.parse(request.body);
  await sessionStore.update(roomCode, (current) => { current.locked = locked; });
  response.json({ success: true, data: { locked } });
});

router.post('/:roomCode/remove-participant', limiter(30), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const { identity } = participantSchema.parse(request.body);
  const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  const guest = session.guests.get(identity);
  if (!guest) { response.status(404).json({ success: false, error: { code: 'PARTICIPANT_NOT_FOUND', message: 'That Guest is no longer connected.' } }); return; }
  guest.removed = true;
  try { await removeParticipant(roomCode, identity); } catch { /* Presence may already have ended. */ }
  response.json({ success: true, data: {} });
});

router.post('/:roomCode/leave', limiter(60), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const { identity } = participantSchema.parse(request.body);
  const session = await service.requireSession(roomCode);
  // Reuse the server-issued media credential already held by this Guest. Peer
  // identities are public in LiveKit; they are selectors, never authorization.
  const authorization = request.get('Authorization') ?? '';
  try {
    if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new Error('Invalid credential');
    const claims = await guestVerifier.verify(authorization.slice(7), 0);
    if (claims.sub !== identity || !identity.startsWith('guest-') ||
        claims.video?.room !== roomCode || claims.video.roomJoin !== true ||
        !session.guests.has(identity)) throw new Error('Wrong participation');
  } catch { throw new ServiceError('GUEST_UNAUTHORIZED', 'Guest authorization is required.', 403); }
  await sessionStore.update(roomCode, current => { const guest = current.guests.get(identity); if (guest) guest.removed = true; });
  try { await removeParticipant(roomCode, identity); } catch { /* Already disconnected; authoritative leave is retained. */ }
  response.json({ success: true, data: {} });
});

router.post('/:roomCode/participant-status', limiter(60), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const { identity } = participantSchema.parse(request.body);
  const session = await service.requireSession(roomCode);
  response.json({ success: true, data: { removed: session.guests.get(identity)?.removed ?? false, status: session.status } });
});

router.post('/:roomCode/end', limiter(10), async (request, response) => {
  const { roomCode } = roomCodeSchema.parse(request.params);
  const session = await service.requireSession(roomCode); service.requireHost(session, authority(request));
  await endSession(session, 'The Host ended the session.');
  response.clearCookie('vc_host', { path: `/api/sessions/${roomCode}` });
  response.json({ success: true, data: {} });
});

export default router;
