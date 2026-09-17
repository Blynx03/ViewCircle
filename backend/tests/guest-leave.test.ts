import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { AccessToken } from 'livekit-server-sdk';
vi.mock('../src/services/livekit-service.js', async load => ({ ...await load<typeof import('../src/services/livekit-service.js')>(), closeRoom: vi.fn(), removeParticipant: vi.fn() }));
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { sessionStore } from '../src/stores/session-store.js';
import { SessionService } from '../src/services/session-service.js';
import { removeParticipant, closeRoom } from '../src/services/livekit-service.js';
const client = () => request(app);
const service = new SessionService(sessionStore);
beforeEach(() => { sessionStore.clear(); vi.clearAllMocks(); });
async function setup() {
  const { session, authority } = await service.create({ hostName: 'Host' });
  await service.hostToken(session, authority);
  const join = async (name: string) => {
    const response = await client().post(`/api/sessions/${session.roomCode}/join`).set('X-ViewCircle-Request', '1').send({ name });
    expect(response.status).toBe(200);
    return response.body.data as { identity: string; token: string };
  };
  return { session, authority, a: await join('A'), b: await join('B') };
}
it('binds self-leave to the signed Guest token, preserves peers/Host/counts, and keeps Host kick/end separate', async () => {
  const { session, authority, a, b } = await setup();
  const leave = (identity: string, token?: string) => {
    const req = client().post(`/api/sessions/${session.roomCode}/leave`).set('X-ViewCircle-Request', '1');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ identity });
  };
  expect((await leave(b.identity, a.token)).status).toBe(403);
  expect((await leave(a.identity)).status).toBe(403);
  expect((await leave(b.identity)).status).toBe(403);
  expect(service.publicView(session).guestCount).toBe(2);
  expect((await client().post(`/api/sessions/${session.roomCode}/remove-participant`).set('X-ViewCircle-Request', '1').set('Authorization', `Bearer ${a.token}`).send({ identity: b.identity })).status).toBe(403);
  expect((await leave(a.identity, a.token)).status).toBe(200);
  expect((await leave(a.identity, a.token)).status).toBe(200); // Idempotent, same participation only.
  expect(session.guests.get(a.identity)?.removed).toBe(true);
  expect(session.guests.get(b.identity)?.removed).toBe(false);
  expect(session.status).toBe('LIVE'); expect(service.publicView(session).guestCount).toBe(1);
  expect(closeRoom).not.toHaveBeenCalled(); expect(removeParticipant).not.toHaveBeenCalled();
  const host = () => request(app).post(`/api/sessions/${session.roomCode}/remove-participant`).set('X-ViewCircle-Request', '1').set('Cookie', `vc_host=${authority}`);
  expect((await host().send({ identity: b.identity })).status).toBe(200);
  expect(removeParticipant).toHaveBeenCalledWith(session.roomCode, b.identity);
  expect(service.publicView(session).guestCount).toBe(0); expect(session.status).toBe('LIVE');
  expect((await client().post(`/api/sessions/${session.roomCode}/end`).set('X-ViewCircle-Request', '1').set('Cookie', `vc_host=${authority}`)).status).toBe(200);
  expect(closeRoom).toHaveBeenCalledWith(session.roomCode);
});
it.each(['wrong-room', 'wrong-key', 'expired', 'host', 'malformed'])('rejects %s credentials without changing participation', async variant => {
  const { session, a } = await setup();
  const token = new AccessToken(env.LIVEKIT_API_KEY, variant === 'wrong-key' ? 'wrong-secret' : env.LIVEKIT_API_SECRET, { identity: variant === 'host' ? `host-${session.id}` : a.identity, ttl: variant === 'expired' ? -60 : 600 });
  token.addGrant({ roomJoin: true, room: variant === 'wrong-room' ? 'ZZZZ' : session.roomCode });
  const credential = variant === 'malformed' ? 'invalid' : await token.toJwt();
  const response = await client().post(`/api/sessions/${session.roomCode}/leave`).set('X-ViewCircle-Request', '1').set('Authorization', `Bearer ${credential}`).send({ identity: a.identity });
  expect(response.status).toBe(403); expect(service.publicView(session).guestCount).toBe(2);
});
it('retains CSRF and Origin checks even with a valid Guest token', async () => {
  const { session, a } = await setup();
  const leave = () => client().post(`/api/sessions/${session.roomCode}/leave`).set('Authorization', `Bearer ${a.token}`);
  expect((await leave().send({ identity: a.identity })).status).toBe(403);
  expect((await leave().set('X-ViewCircle-Request', '1').set('Origin', 'https://foreign.example').send({ identity: a.identity })).status).toBe(403);
  expect(service.publicView(session).guestCount).toBe(2);
});
