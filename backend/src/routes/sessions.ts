import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sessionStore } from '../stores/session-store.js';
import { SessionService } from '../services/session-service.js';
import { closeRoom, removeParticipant } from '../services/livekit-service.js';
import { createSessionSchema, joinSessionSchema, lockSchema, participantSchema, roomCodeSchema } from '../validation/session.js';
import { env } from '../config/env.js';

const router = Router();
const service = new SessionService(sessionStore);
const limiter = (max: number) => rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false, skip: () => env.NODE_ENV === 'test' });
const authority = (request: { cookies?: Record<string, unknown> }): string | undefined => {
  const value = request.cookies?.vc_host;
  return typeof value === 'string' ? value : undefined;
};

router.post('/', limiter(10), async (request, response) => {
  const input = createSessionSchema.parse(request.body);
  const created = await service.create(input);
  response.cookie('vc_host', created.authority, {
    httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000,
    path: `/api/sessions/${created.session.roomCode}`
  });
  response.status(201).json({ success: true, data: service.publicView(created.session) });
});

router.get('/:roomCode/public', limiter(60), async (request, response) => {
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
  const guest = session.guests.get(identity); if (guest) guest.removed = true;
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
  await sessionStore.update(roomCode, (current) => { current.status = 'ENDED'; current.endedAt = new Date(); });
  await closeRoom(roomCode);
  response.clearCookie('vc_host', { path: `/api/sessions/${roomCode}` });
  response.json({ success: true, data: {} });
});

export default router;
