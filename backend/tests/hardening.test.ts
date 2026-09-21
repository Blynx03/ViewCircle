import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackSource, type ParticipantInfo } from 'livekit-server-sdk';
vi.mock('../src/services/livekit-service.js', () => ({
  createMediaToken: vi.fn(async () => 'token'), provisionRoom: vi.fn(async () => undefined),
  expireRoom: vi.fn(async () => undefined), roomPresence: vi.fn(async () => []), removeParticipant: vi.fn()
}));
import { app } from '../src/app.js';
import { digest } from '../src/access/routes.js';
import { memoryAccessStore } from '../src/access/store.js';
import { sessionStore } from '../src/stores/session-store.js';
import { SessionService } from '../src/services/session-service.js';
import { expireRoom, provisionRoom, roomPresence } from '../src/services/livekit-service.js';
import { endSession, lifecycleReason, reconcileSession, waitingDeadline } from '../src/services/session-expiry.js';
const service = new SessionService(sessionStore);
const client = () => request.agent(app).set('X-ViewCircle-Request', '1');
function host(id: string) {
  memoryAccessStore.requests.set(id, { id, name: id, status: 'approved', browserHash: digest(id), creations: 0, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
  return client().set('Cookie', `vc_visitor=${id}`);
}
function owner() { memoryAccessStore.owners.set(digest('owner'), { expiresAt: Date.now() + 86_400_000, creations: 0 }); return client().set('Cookie', 'vc_owner=owner'); }
beforeEach(() => { sessionStore.clear(); memoryAccessStore.clear(); vi.resetAllMocks(); vi.mocked(roomPresence).mockResolvedValue([]); vi.mocked(provisionRoom).mockResolvedValue(); vi.mocked(expireRoom).mockResolvedValue(); vi.mocked(importToken).mockResolvedValue('token'); });
import { createMediaToken as importToken } from '../src/services/livekit-service.js';
describe('capacity, accounting and recovery', () => {
  it('enforces two global rooms across authorizations, one per authorization, and rolls back rejected creation', async () => {
    const a = host('a'), b = host('b'), c = host('c');
    expect((await a.post('/api/sessions').send({ hostName: 'A' })).status).toBe(201);
    expect((await a.post('/api/sessions').send({ hostName: 'A' })).body.error.code).toBe('ACTIVE_SESSION_EXISTS');
    expect((await b.post('/api/sessions').send({ hostName: 'B' })).status).toBe(201);
    expect((await c.post('/api/sessions').send({ hostName: 'C' })).body.error.message).toBe('All available session slots are currently in use.');
    expect(memoryAccessStore.requests.get('c')!.creations).toBe(0);
    expect(sessionStore.all().filter(s => s.status !== 'ENDED')).toHaveLength(2);
  });
  it('does not consume usage when LiveKit creation fails', async () => {
    vi.mocked(provisionRoom).mockRejectedValueOnce(new Error('offline'));
    const a = host('a'); expect((await a.post('/api/sessions').send({ hostName: 'A' })).status).toBe(500);
    expect(memoryAccessStore.requests.get('a')!.creations).toBe(0);
    expect(sessionStore.all().every(s => s.status === 'ENDED')).toBe(true);
  });
  it('recovers existing room and replaces only after old media deletion completes', async () => {
    const a = host('a'); const first = await a.post('/api/sessions').send({ hostName: 'A' }); const code = first.body.data.roomCode as string;
    const createdAt = (await sessionStore.find(code))!.createdAt;
    expect((await a.get('/api/sessions/active')).body.data.roomCode).toBe(code);
    expect((await a.post('/api/sessions/recover')).body.data.roomCode).toBe(code);
    expect((await sessionStore.find(code))!.createdAt).toEqual(createdAt);
    vi.mocked(expireRoom).mockRejectedValueOnce(new Error('offline'));
    expect((await a.post('/api/sessions').send({ hostName: 'B', replace: true })).status).toBe(500);
    expect(provisionRoom).toHaveBeenCalledTimes(1);
    expect((await a.post('/api/sessions').send({ hostName: 'B', replace: true })).status).toBe(201);
    expect((await sessionStore.find(code))!.status).toBe('ENDED');
    expect(sessionStore.all().filter(s => s.status !== 'ENDED')).toHaveLength(1);
  });
  it('identifies exhausted authorization usage separately from capacity', async () => {
    const a = host('a'); memoryAccessStore.requests.get('a')!.creations = 5;
    const result = await a.post('/api/sessions').send({ hostName: 'A' });
    expect(result.body.error.code).toBe('DEMO_CREATION_LIMIT'); expect(sessionStore.all()).toHaveLength(0);
  });
});
describe('Public requests and Private invitations', () => {
  it('hides Private sessions, admits valid codes without PIN, rejects unknown and expired codes', async () => {
    const a = host('a'); const created = await a.post('/api/sessions').send({ hostName: 'A', visibility: 'private' }); const code = created.body.data.roomCode as string;
    expect((await client().get('/api/sessions/available')).body.data).toEqual([]);
    expect((await client().post(`/api/sessions/${code}/join`).send({ name: 'Guest' })).status).toBe(200);
    expect((await client().post('/api/sessions/ZZZZ/join').send({ name: 'Guest' })).status).toBe(404);
    await a.post(`/api/sessions/${code}/end`);
    expect((await client().post(`/api/sessions/${code}/join`).send({ name: 'Guest' })).status).toBe(410);
  });
  it('protects admission, deduplicates, denies and applies Allow All only to the snapshot', async () => {
    const a = host('a'); const created = await a.post('/api/sessions').send({ hostName: 'A', visibility: 'public' }); const code = created.body.data.roomCode as string;
    const rooms = (await client().get('/api/sessions/available')).body.data as Array<{ id: string }>;
    expect(rooms).toHaveLength(1); expect(JSON.stringify(rooms)).not.toContain(code);
    expect((await client().post(`/api/sessions/${code}/join`).send({ name: 'Guest' })).status).toBe(403);
    const ask = (secret: string) => client().post(`/api/sessions/available/${rooms[0]!.id}/requests`).send({ name: 'Guest', secret });
    const one = (await ask('a'.repeat(32))).body.data.id as string;
    expect((await ask('a'.repeat(32))).body.data.id).toBe(one);
    const two = (await ask('b'.repeat(32))).body.data.id as string;
    expect((await client().post(`/api/sessions/${code}/requests/decide`).send({ ids: [one], allow: true })).status).toBe(403);
    await a.post(`/api/sessions/${code}/requests/decide`).send({ ids: [one], allow: true });
    const poll = (id: string, secret: string) => client().post(`/api/sessions/${code}/requests/${id}/status`).send({ secret });
    const concurrent = await Promise.all([poll(one, 'a'.repeat(32)), poll(one, 'a'.repeat(32))]);
    expect(concurrent[0].body.data.credentials.identity).toBe(concurrent[1].body.data.credentials.identity);
    expect((await poll(two, 'b'.repeat(32))).body.data.status).toBe('pending');
    await a.post(`/api/sessions/${code}/requests/decide`).send({ ids: [two], allow: false });
    expect((await poll(two, 'b'.repeat(32))).body.data.status).toBe('denied');
    const session = (await sessionStore.find(code))!; session.requests!.get(one)!.expiresAt = Date.now() - 1;
    expect((await poll(one, 'a'.repeat(32))).status).toBe(410);
    await endSession(session); expect(session.requests!.size).toBe(0);
  });
});
describe('server lifecycle boundaries', () => {
  it('warns at five minutes, ends at 5:30, extends once to eight minutes', async () => {
    const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
    expect(lifecycleReason(session, start + 300_000)).toBeUndefined();
    expect(lifecycleReason(session, start + 329_999)).toBeUndefined();
    expect(lifecycleReason(session, start + 330_000)).toContain('No Guests');
    session.keepWaiting = true;
    expect(waitingDeadline(session)).toBe(start + 480_000);
    expect(lifecycleReason(session, start + 450_000)).toBeUndefined();
    expect(lifecycleReason(session, start + 480_000)).toContain('No Guests');
  });
  it('extends for a 4:59 request, bounds the extension and resumes after resolution', async () => {
    const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
    session.requests!.set('r', { id: 'r', secretHash: 'secret', name: 'Guest', expiresAt: start + 419_000, status: 'pending' });
    await reconcileSession(session, start + 329_000);
    expect(waitingDeadline(session)).toBe(start + 359_000);
    session.requests!.get('r')!.status = 'denied';
    await reconcileSession(session, start + 359_000); expect(session.status).toBe('ENDED');
  });
  it('observes real attendance, guest return and Host reconnect before their deadlines', async () => {
    const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
    const guest = { identity: 'guest-a', name: 'Guest', joinedAt: new Date(start), removed: false }; session.guests.set(guest.identity, guest);
    const hostInfo = { identity: `host-${session.id}`, tracks: [{ source: TrackSource.CAMERA, muted: false }] } as ParticipantInfo;
    const guestInfo = { identity: guest.identity, tracks: [] } as unknown as ParticipantInfo;
    vi.mocked(roomPresence).mockResolvedValue([hostInfo, guestInfo]); await reconcileSession(session, start);
    expect(session.everJoined).toBe(true);
    vi.mocked(roomPresence).mockResolvedValue([hostInfo]); await reconcileSession(session, start + 1000); expect(session.aloneSince).toBe(start + 1000);
    vi.mocked(roomPresence).mockResolvedValue([hostInfo, guestInfo]); await reconcileSession(session, start + 120_999); expect(session.aloneSince).toBeUndefined();
    vi.mocked(roomPresence).mockResolvedValue([guestInfo]); await reconcileSession(session, start + 121_000); expect(session.hostMissingSince).toBe(start + 121_000);
    vi.mocked(roomPresence).mockResolvedValue([hostInfo, guestInfo]); await reconcileSession(session, start + 240_999); expect(session.hostMissingSince).toBeUndefined();
    expect(session.createdAt.getTime()).toBe(start);
  });
  it.each(['aloneSince', 'hostMissingSince', 'cameraMissingSince'] as const)('ends %s after 120 seconds', async field => {
    const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime(); session.everJoined = true; session[field] = start;
    expect(lifecycleReason(session, start + 119_999)).toBeUndefined(); expect(lifecycleReason(session, start + 120_000)).toBeTruthy();
  });
  it('camera recovery clears its deadline and three hours overrides every recovery state', async () => {
    const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
    vi.mocked(roomPresence).mockResolvedValue([{ identity: `host-${session.id}`, tracks: [] }] as unknown as ParticipantInfo[]);
    await reconcileSession(session, start); expect(session.cameraMissingSince).toBe(start);
    vi.mocked(roomPresence).mockResolvedValue([{ identity: `host-${session.id}`, tracks: [{ source: TrackSource.CAMERA, muted: false }] }] as ParticipantInfo[]);
    await reconcileSession(session, start + 119_000); expect(session.cameraMissingSince).toBeUndefined();
    session.cameraMissingSince = start + 179 * 60_000;
    await reconcileSession(session, start + 180 * 60_000); expect(session.status).toBe('ENDED'); expect(session.endingReason).toContain('three-hour');
  });
  it('converges competing ends and retries failed deletion without releasing capacity prematurely', async () => {
    const { session } = await service.create({ hostName: 'A' });
    vi.mocked(expireRoom).mockRejectedValueOnce(new Error('offline'));
    await expect(endSession(session)).rejects.toThrow('offline'); expect(session.status).toBe('EXPIRED');
    await Promise.all([endSession(session), endSession(session), endSession(session)]); expect(expireRoom).toHaveBeenCalledTimes(2);
    await endSession(session); expect(expireRoom).toHaveBeenCalledTimes(2);
  });
});
describe('Owner recovery security', () => {
  it('shows 0/2, 1/2 and 2/2 and supports end, end all and usage reset', async () => {
    const admin = owner(); expect((await admin.get('/api/owner/sessions')).body.data).toEqual({ capacity: 2, sessions: [] });
    const a = host('a'), b = host('b'); const room = await a.post('/api/sessions').send({ hostName: 'A' });
    expect((await admin.get('/api/owner/sessions')).body.data.sessions).toHaveLength(1);
    await b.post('/api/sessions').send({ hostName: 'B' }); expect((await admin.get('/api/owner/sessions')).body.data.sessions).toHaveLength(2);
    await admin.post(`/api/owner/sessions/${room.body.data.roomCode}/end`); expect((await admin.get('/api/owner/sessions')).body.data.sessions).toHaveLength(1);
    await admin.post('/api/owner/sessions/end-all'); expect((await admin.get('/api/owner/sessions')).body.data.sessions).toHaveLength(0);
    await admin.post('/api/owner/reset-creations'); expect(memoryAccessStore.requests.get('a')!.creations).toBe(0);
  });
  it('rejects unauthorized, missing-header and foreign-origin mutations', async () => {
    const admin = owner();
    for (const path of ['/api/owner/sessions/ABCD/end', '/api/owner/sessions/end-all', '/api/owner/reset-creations']) {
      expect((await client().post(path)).status).toBe(401);
      expect((await admin.post(path).unset('X-ViewCircle-Request')).status).toBe(403);
      expect((await admin.post(path).set('Origin', 'https://evil.example')).status).toBe(403);
    }
  });
});

it('keeps usage rollback isolated from a concurrent Owner reset', async () => {
  host('a'); const identity = { kind: 'visitor' as const, id: 'a' };
  const old = await memoryAccessStore.reserveCreation(identity, 5);
  await memoryAccessStore.resetCreations(); await memoryAccessStore.reserveCreation(identity, 5);
  await memoryAccessStore.releaseCreation(identity, old);
  expect(memoryAccessStore.requests.get('a')!.creations).toBe(1);
});
it('bounds repeated pending requests to ten minutes of empty-room lifetime', async () => {
  const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
  session.requests!.set('one', { id: 'one', name: 'Guest', secretHash: 'secret', status: 'pending', expiresAt: start + 700_000 });
  await reconcileSession(session, start + 599_000); expect(waitingDeadline(session)).toBe(start + 600_000);
  await reconcileSession(session, start + 600_000); expect(session.status).toBe('ENDED');
});
it('observes a Guest arriving on the waiting boundary before deciding to terminate', async () => {
  const { session } = await service.create({ hostName: 'A' }); const start = session.createdAt.getTime();
  session.guests.set('guest-a', { identity: 'guest-a', name: 'A', joinedAt: new Date(start), removed: false });
  vi.mocked(roomPresence).mockResolvedValue([{ identity: 'guest-a', tracks: [] }] as unknown as ParticipantInfo[]);
  await reconcileSession(session, start + 330_000); expect(session.everJoined).toBe(true); expect(session.status).not.toBe('ENDED');
});
it('rejects recovery after Owner termination and does not create a fresh room', async () => {
  const a = host('a'); const admin = owner(); await a.post('/api/sessions').send({ hostName: 'A' });
  await admin.post('/api/owner/sessions/end-all'); expect((await a.post('/api/sessions/recover')).status).toBe(410);
  expect(provisionRoom).toHaveBeenCalledTimes(1);
});

it('releases stale capacity when LiveKit reports an externally deleted room', async () => {
  const { session } = await service.create({ hostName: 'A' }); session.everJoined = true;
  vi.mocked(roomPresence).mockRejectedValueOnce({ status: 404, code: 'not_found' });
  await reconcileSession(session); expect(session.status).toBe('ENDED'); expect(expireRoom).toHaveBeenCalledWith(session.roomCode);
});

it('does not treat an in-flight media provision as an externally deleted room', async () => {
  const { session } = await service.create({ hostName: 'A' }, 'visitor:provisioning');
  vi.mocked(roomPresence).mockRejectedValueOnce({ status: 404 });
  await reconcileSession(session); expect(roomPresence).not.toHaveBeenCalled(); expect(session.status).toBe('CREATED');
  await reconcileSession(session, session.createdAt.getTime() + 330_000); expect(session.status).toBe('ENDED');
});
