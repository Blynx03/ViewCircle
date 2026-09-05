import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/livekit-service.js', () => ({
  createMediaToken: vi.fn(async ({ role }: { role: string }) => `${role}-token`),
  removeParticipant: vi.fn(async () => undefined),
  closeRoom: vi.fn(async () => undefined)
}));

import { app } from '../src/app.js';
import { InMemorySessionStore, sessionStore } from '../src/stores/session-store.js';
import { SessionService } from '../src/services/session-service.js';
import { ROOM_ALPHABET } from '../src/utilities/security.js';

const create = (agent = request.agent(app), body: Record<string, unknown> = { hostName: 'Avery' }) => agent.post('/api/sessions').send(body);

beforeEach(() => sessionStore.clear());

describe('session API', () => {
  it('creates a session with a human-friendly four-character code', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body.data.roomCode).toMatch(new RegExp(`^[${ROOM_ALPHABET}]{4}$`));
    expect(response.body.data.pinRequired).toBe(false);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('retries a room-code collision', async () => {
    const store = new InMemorySessionStore(); let calls = 0;
    const service = new SessionService(store, () => (++calls < 3 ? 'ABCD' : 'EFGH'));
    await service.create({ hostName: 'First' });
    const second = await service.create({ hostName: 'Second' });
    expect(second.session.roomCode).toBe('EFGH');
  });

  it('supports public lookup and private PIN validation', async () => {
    const created = await create(undefined, { hostName: 'Avery', sessionName: 'Walk', pin: '4827' });
    const code = created.body.data.roomCode as string;
    const publicResult = await request(app).get(`/api/sessions/${code}/public`);
    expect(publicResult.body.data).toMatchObject({ sessionName: 'Walk', pinRequired: true });
    expect(JSON.stringify(publicResult.body)).not.toContain('4827');
    expect((await request(app).post(`/api/sessions/${code}/join`).send({ name: 'Sam', pin: '1111' })).body.error.code).toBe('WRONG_PIN');
    expect((await request(app).post(`/api/sessions/${code}/join`).send({ name: 'Sam', pin: '4827' })).body.data.token).toBe('guest-token');
  });

  it('allows ten Guests and atomically rejects the eleventh', async () => {
    const created = await create(); const code = created.body.data.roomCode as string;
    const results = await Promise.all(Array.from({ length: 11 }, (_, index) => request(app).post(`/api/sessions/${code}/join`).send({ name: `Guest ${index}` })));
    expect(results.filter((result) => result.status === 200)).toHaveLength(10);
    expect(results.find((result) => result.status === 409)?.body.error.code).toBe('SESSION_FULL');
  });

  it('lets only the Host lock, unlock, remove Guests, and end', async () => {
    const agent = request.agent(app); const created = await create(agent); const code = created.body.data.roomCode as string;
    const guest = await request(app).post(`/api/sessions/${code}/join`).send({ name: 'Sam' });
    expect((await request(app).post(`/api/sessions/${code}/lock`).send({ locked: true })).body.error.code).toBe('HOST_UNAUTHORIZED');
    expect((await agent.post(`/api/sessions/${code}/lock`).send({ locked: true })).body.data.locked).toBe(true);
    expect((await request(app).post(`/api/sessions/${code}/join`).send({ name: 'Lee' })).body.error.code).toBe('SESSION_LOCKED');
    expect((await agent.post(`/api/sessions/${code}/lock`).send({ locked: false })).body.data.locked).toBe(false);
    expect((await agent.post(`/api/sessions/${code}/remove-participant`).send({ identity: guest.body.data.identity })).status).toBe(200);
    expect((await request(app).post(`/api/sessions/${code}/participant-status`).send({ identity: guest.body.data.identity })).body.data.removed).toBe(true);
    expect((await request(app).post(`/api/sessions/${code}/end`)).body.error.code).toBe('HOST_UNAUTHORIZED');
    expect((await agent.post(`/api/sessions/${code}/end`)).status).toBe(200);
    expect((await request(app).post(`/api/sessions/${code}/join`).send({ name: 'New' })).body.error.code).toBe('SESSION_ENDED');
  });

  it('rejects invalid input consistently', async () => {
    expect((await create(undefined, { hostName: '' })).body.error.code).toBe('INVALID_INPUT');
    expect((await request(app).get('/api/sessions/IO10/public')).body.error.code).toBe('INVALID_INPUT');
  });
});
