import supertest from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { TrackSource, type ParticipantInfo } from 'livekit-server-sdk';
vi.mock('../src/services/livekit-service.js', async load => ({ ...await load<typeof import('../src/services/livekit-service.js')>(), roomPresence: vi.fn(async () => []), expireRoom: vi.fn(async () => {}), removeParticipant: vi.fn(async () => {}) }));
import { app } from '../src/app.js';
import { createMediaToken, roomPresence } from '../src/services/livekit-service.js';
import { SessionService } from '../src/services/session-service.js';
import { sessionStore } from '../src/stores/session-store.js';
import { endSession } from '../src/services/session-expiry.js';
const service = new SessionService(sessionStore);
beforeEach(() => { sessionStore.clear(); vi.clearAllMocks(); });
async function setup(visibility: 'public' | 'private' = 'private') {
  const { session, authority } = await service.create({ hostName: 'Host', visibility });
  await service.hostToken(session, authority);
  const credentials = await service.join(session, 'Returning Guest', undefined, true);
  const guest = session.guests.get(credentials.identity)!;
  guest.connected = true; guest.missingSince = Date.now() - 30_000; session.everJoined = true;
  vi.mocked(roomPresence).mockResolvedValue([{ identity: `host-${session.id}`, tracks: [{ source: TrackSource.CAMERA, muted: false }] }] as ParticipantInfo[]);
  const client = supertest.agent(app).set('Cookie', `vc_guest_recovery=${credentials.token}`).set('X-ViewCircle-Request', '1');
  return { session, guest, credentials, client };
}
it.each(['private', 'public'] as const)('validates and rejoins admitted %s Guest with the same name and identity without resetting grace', async visibility => {
  const { session, guest, credentials, client } = await setup(visibility); const deadline = guest.missingSince;
  const checked = await client.get('/api/sessions/guest-recovery');
  expect(checked.status).toBe(200); expect(checked.body.data).toMatchObject({ name: guest.name, identity: guest.identity, roomCode: session.roomCode });
  expect(checked.body.data.credentials).toBeUndefined(); expect(checked.headers['cache-control']).toBe('no-store');
  const rejoined = await client.post('/api/sessions/guest-recovery');
  expect(rejoined.body.data.credentials).toMatchObject(credentials);
  expect(session.guests.size).toBe(1); expect(session.requests?.size).toBe(0);
  expect(guest.missingSince).toBe(deadline); expect(session.aloneSince).toBeUndefined();
});
it.each(['ended', 'expired', 'host-ended', 'owner-ended', 'locked', 'removed', 'grace-expired', 'never-connected', 'reused-code'] as const)('rejects %s recovery and clears the cookie', async kind => {
  const { session, guest, client } = await setup();
  if (kind === 'ended') session.status = 'ENDED';
  if (kind === 'expired') session.createdAt = new Date(Date.now() - 180 * 60_000);
  if (kind === 'host-ended' || kind === 'owner-ended') await endSession(session, kind);
  if (kind === 'locked') session.locked = true;
  if (kind === 'removed') guest.removed = true;
  if (kind === 'grace-expired') guest.missingSince = Date.now() - 120_001;
  if (kind === 'never-connected') { delete guest.connected; delete guest.missingSince; }
  if (kind === 'reused-code') session.guests.clear();
  const checked = await client.get('/api/sessions/guest-recovery'); expect(checked.body.data).toBeNull();
  expect(checked.headers['set-cookie']?.[0]).toContain('vc_guest_recovery=;');
  expect((await client.post('/api/sessions/guest-recovery')).body.data).toBeNull();
});
it('rechecks on click and never extends an expired grace window', async () => {
  const { guest, client } = await setup(); expect((await client.get('/api/sessions/guest-recovery')).body.data).not.toBeNull();
  guest.missingSince = Date.now() - 120_001;
  expect((await client.post('/api/sessions/guest-recovery')).body.data).toBeNull();
});
it('fails closed on presence outage and never trusts a forged or Host cookie', async () => {
  const { client, session } = await setup(); vi.mocked(roomPresence).mockRejectedValue(new Error('offline'));
  expect((await client.get('/api/sessions/guest-recovery')).status).toBe(500);
  const forged = await supertest(app).get('/api/sessions/guest-recovery').set('Cookie', 'vc_guest_recovery=invalid'); expect(forged.body.data).toBeNull();
  const host = await createMediaToken({ roomCode: session.roomCode, identity: `host-${session.id}`, name:'Host', role:'host' });
  expect((await supertest(app).get('/api/sessions/guest-recovery').set('Cookie', `vc_guest_recovery=${host}`)).body.data).toBeNull();
});
it('stores recovery as an HttpOnly Guest cookie on join and clears it on Leave/Not Now', async () => {
  const { session } = await service.create({ hostName: 'Host' });
  const client = supertest.agent(app).set('X-ViewCircle-Request', '1');
  const joined = await client.post(`/api/sessions/${session.roomCode}/join`).send({ name: 'G' });
  const cookie = joined.headers['set-cookie']?.[0] ?? '';
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax'); expect(cookie).toContain('Path=/api/sessions'); expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(10800);
  expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeGreaterThanOrEqual(10798);
  const left = await client.post(`/api/sessions/${session.roomCode}/leave`).set('Authorization', `Bearer ${joined.body.data.token}`).send({ identity: joined.body.data.identity });
  expect(left.headers['set-cookie']?.[0]).toContain('vc_guest_recovery=;');
  const dismissed = await client.post('/api/sessions/guest-recovery/dismiss'); expect(dismissed.headers['set-cookie']?.[0]).toContain('vc_guest_recovery=;');
});
it('requires existing CSRF checks for recovery and dismissal', async () => {
  const { credentials } = await setup();
  for (const path of ['guest-recovery', 'guest-recovery/dismiss']) expect((await supertest(app).post(`/api/sessions/${path}`).set('Cookie', `vc_guest_recovery=${credentials.token}`)).status).toBe(403);
});
