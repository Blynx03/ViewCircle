import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/livekit-service.js', () => ({
  provisionRoom: vi.fn(async () => undefined), createMediaToken: vi.fn(async () => 'media-token'),
  expireRoom: vi.fn(async () => undefined), roomPresence: vi.fn(async () => []), removeParticipant: vi.fn()
}));
import { app } from '../src/app.js';
import { SessionService } from '../src/services/session-service.js';
import { sessionStore } from '../src/stores/session-store.js';
import { memoryAccessStore } from '../src/access/store.js';
import { digest } from '../src/access/routes.js';
import { createMediaToken } from '../src/services/livekit-service.js';
const service = new SessionService(sessionStore);
const client = () => request.agent(app).set('X-ViewCircle-Request', '1');
beforeEach(() => { sessionStore.clear(); memoryAccessStore.clear(); vi.clearAllMocks(); });
function authorized(status: 'pending' | 'approved' | 'denied' | 'expired' = 'approved') {
  memoryAccessStore.requests.set('approval', { id: 'approval', browserHash: digest('visitor'), name: 'Charlie', emailOrCompany: 'not-public', createdAt: Date.now(), expiresAt: Date.now() + 60_000, status, creations: 0 });
  return client().set('Cookie', 'vc_visitor=visitor');
}
it('reports provisioning accurately then admits Private Guests without any request record', async () => {
  const { session } = await service.create({ hostName: 'Host', visibility: 'private' }, 'visitor:approval');
  const url = `/api/sessions/${session.roomCode}`;
  expect((await client().get(`${url}/public`)).body.data).toMatchObject({ visibility: 'private', provisioning: true, joinable: false });
  expect((await client().post(`${url}/join`).send({ name: 'Guest' })).body.error.code).toBe('SESSION_PREPARING');
  session.provisioning = false; session.status = 'LIVE';
  expect((await client().get(`${url}/public`)).body.data).toMatchObject({ provisioning: false, joinable: true });
  expect((await client().post(`${url}/join`).send({ name: 'Guest' })).body.data.token).toBe('media-token');
  expect(session.requests!.size).toBe(0);
  expect((await client().get('/api/sessions/available')).body.data).toEqual([]);
  expect((await client().post(`/api/sessions/available/${session.discoveryId}/requests`).send({ name: 'Guest', secret: 'a'.repeat(32) })).status).toBe(410);
});
it('keeps Public direct entry approval-gated', async () => {
  const { session } = await service.create({ hostName: 'Host', visibility: 'public' });
  expect((await client().post(`/api/sessions/${session.roomCode}/join`).send({ name: 'Guest' })).body.error.code).toBe('APPROVAL_REQUIRED');
  expect((await client().get('/api/sessions/available')).body.data).toHaveLength(1);
});
it.each(['ENDED', 'EXPIRED'] as const)('rejects Private %s invitations and reports not joinable', async status => {
  const { session } = await service.create({ hostName: 'Host', visibility: 'private' }); session.status = status;
  expect((await client().get(`/api/sessions/${session.roomCode}/public`)).body.data.joinable).toBe(false);
  expect((await client().post(`/api/sessions/${session.roomCode}/join`).send({ name: 'Guest' })).status).toBe(410);
});
it('rejects an unknown Private room code', async () => {
  expect((await client().post('/api/sessions/AB7K/join').send({ name: 'Guest' })).status).toBe(404);
});
it('returns only the authenticated approved requestor name, without private access-record fields', async () => {
  const result = await authorized().get('/api/access');
  expect(result.body.data.requestorName).toBe('Charlie');
  expect(JSON.stringify(result.body)).not.toMatch(/not-public|browserHash|creations|password/i);
  expect((await client().get('/api/access')).body.data.requestorName).toBeUndefined();
});
it.each(['pending', 'denied', 'expired'] as const)('does not carry forward a %s name', async status => {
  expect((await authorized(status).get('/api/access')).body.data.requestorName).toBeUndefined();
});
it.each(['public', 'private'] as const)('uses an edited Host name for %s media credentials', async visibility => {
  const host = authorized(); const result = await host.post('/api/sessions').send({ hostName: 'Edited Charlie', visibility });
  expect(result.status).toBe(201);
  const code = result.body.data.roomCode as string;
  expect((await host.post(`/api/sessions/${code}/host-token`)).status).toBe(200);
  expect(createMediaToken).toHaveBeenCalledWith(expect.objectContaining({ name: 'Edited Charlie', role: 'host' }));
});
