import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/services/livekit-service.js', async load => ({ ...await load<typeof import('../src/services/livekit-service.js')>(), closeRoom: vi.fn(), expireRoom: vi.fn(async () => undefined), provisionRoom: vi.fn(async () => undefined), roomPresence: vi.fn(async () => []), removeParticipant: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn(async () => ({})) } }));
import webpush from 'web-push';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { memoryAccessStore as accessStore } from '../src/access/store.js';
import { digest } from '../src/access/routes.js';
import { notifyOwner } from '../src/access/push.js';
import { sessionStore } from '../src/stores/session-store.js';
let ip = 0;
const client = () => request.agent(app).set('X-ViewCircle-Request', '1').set('X-Forwarded-For', `192.0.2.${++ip}`);
const owner = () => { accessStore.owners.set(digest('owner-test'), { expiresAt: Date.now() + 3600000, creations: 0 }); return client().set('Cookie', 'vc_owner=owner-test'); };
function approved() {
  accessStore.requests.set('approved', { id: 'approved', name: 'Visitor', status: 'approved', createdAt: Date.now(), expiresAt: Date.now() + 3600000, browserHash: digest('visitor-test'), creations: 0 });
  return client().set('Cookie', 'vc_visitor=visitor-test');
}
const subscription = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } };
beforeEach(async () => {
  accessStore.clear(); sessionStore.clear(); vi.clearAllMocks();
  app.set('trust proxy', 'loopback'); // Explicit trusted local test proxy; production defaults to no trust.
  env.OWNER_USERNAME = 'test-owner'; env.OWNER_PASSWORD_HASH = await bcrypt.hash('test-only-password', 4); env.OWNER_SESSION_SECRET = 'test-only-session-secret-not-for-production';
  env.VAPID_PUBLIC_KEY = 'test-public'; env.VAPID_PRIVATE_KEY = 'test-private'; env.VAPID_SUBJECT = 'mailto:test@example.com';
});
describe('Owner security', () => {
  it('validates login, keeps credentials out of responses, and invalidates logout', async () => {
    const agent = client();
    const result = await agent.post('/api/owner/login').send({ username: 'test-owner', password: 'test-only-password' });
    expect(result.status).toBe(200); expect(JSON.stringify(result.body)).not.toMatch(/password|hash|secret|cookie/i);
    expect(result.headers['set-cookie']![0]!).toContain('HttpOnly'); expect(result.headers['set-cookie']![0]!).toContain('SameSite=Lax');
    expect(result.headers['set-cookie']![0]!).not.toContain('Expires=');
    expect(result.body.data.expiresAt - Date.now()).toBeCloseTo(12 * 3600000, -3);
    const stolen = result.headers['set-cookie']![0]!.split(';')[0]!;
    expect((await agent.get('/api/owner/access-requests')).status).toBe(200);
    expect((await agent.post('/api/owner/logout')).status).toBe(200);
    expect((await client().set('Cookie', stolen).get('/api/owner/access-requests')).status).toBe(401);
  });
  it('Remember Me lasts 30 days', async () => {
    const result = await client().post('/api/owner/login').send({ username: 'test-owner', password: 'test-only-password', rememberMe: true });
    expect(result.status).toBe(200); expect(result.headers['set-cookie']![0]!).toContain('Max-Age=2592000');
    expect(result.body.data.expiresAt - Date.now()).toBeCloseTo(30 * 24 * 3600000, -3);
  });
  it('uses Secure cookies in production', async () => {
    env.NODE_ENV = 'production';
    try {
      const result = await client().post('/api/owner/login').send({ username: 'test-owner', password: 'test-only-password', rememberMe: true });
      expect(result.status).toBe(200); expect(result.headers['set-cookie']![0]!).toContain('Secure');
    } finally { env.NODE_ENV = 'test'; }
  });
  it('rejects invalid credentials generically and limits repeated attempts', async () => {
    const agent = client();
    for (let index = 0; index < 5; index++) {
      const result = await agent.post('/api/owner/login').send({ username: index % 2 ? 'test-owner' : 'unknown', password: 'wrong' });
      expect(result.status).toBe(401); expect(result.body.error.message).toBe('Invalid credentials.');
    }
    expect((await agent.post('/api/owner/login').send({ username: 'test-owner', password: 'test-only-password' })).status).toBe(429);
  });
  it('rejects absent, expired and visitor Owner authority on all Owner operations', async () => {
    const visitor = approved();
    for (const agent of [client(), visitor]) {
      expect((await agent.get('/api/owner/access-requests')).status).toBe(401);
      for (const route of ['access-requests/approved/approve', 'access-requests/approved/deny', 'push-subscriptions']) expect((await agent.post(`/api/owner/${route}`).send(subscription)).status).toBe(401);
      expect((await agent.delete('/api/owner/push-subscriptions').send({ endpoint: subscription.endpoint })).status).toBe(401);
    }
    const admin = owner(); accessStore.owners.get(digest('owner-test'))!.expiresAt = Date.now() - 1;
    expect((await admin.get('/api/owner/access-requests')).status).toBe(401);
  });
  it('rejects missing CSRF headers and foreign origins, including login', async () => {
    expect((await request(app).post('/api/owner/login').send({})).status).toBe(403);
    expect((await owner().set('Origin', 'https://evil.example').post('/api/owner/access-requests/x/approve')).status).toBe(403);
    expect((await client().set('Origin', 'https://evil.example').post('/api/access-requests').send({ name: 'Test' })).status).toBe(403);
    expect((await client().set('Sec-Fetch-Site', 'cross-site').post('/api/owner/login').send({})).status).toBe(403);
  });
});
describe('Visitor authorization and requests', () => {
  it('requires demo approval only for creation and preserves room Host authority', async () => {
    const agent = client(); const admin = owner();
    expect((await agent.get('/api/health')).status).toBe(200);
    expect((await agent.post('/api/sessions').send({ hostName: 'Guest' })).body.error.code).toBe('ACCESS_REQUIRED');
    const created = await admin.post('/api/sessions').send({ hostName: 'Host', pin: '1234' });
    const code = created.body.data.roomCode as string;
    expect((await agent.get(`/api/sessions/${code}/public`)).status).toBe(200);
    expect((await agent.post(`/api/sessions/${code}/join`).send({ name: 'Guest' })).status).toBe(200);
    accessStore.owners.get(digest('owner-test'))!.creations = 5;
    const joined = await agent.post(`/api/sessions/${code}/join`).send({ name: 'Guest', pin: '1234' });
    expect(joined.status).toBe(200);
    expect(accessStore.owners.get(digest('owner-test'))!.creations).toBe(5);
    expect((await agent.post('/api/sessions').send({ hostName: 'Guest' })).body.error.code).toBe('ACCESS_REQUIRED');
    expect((await agent.post(`/api/sessions/${code}/join`).unset('X-ViewCircle-Request').send({ name: 'Guest', pin: '1234' })).status).toBe(403);
    expect(accessStore.requests.size).toBe(0);
    for (const route of ['host-token', 'lock', 'remove-participant', 'end']) {
      expect((await agent.post(`/api/sessions/${code}/${route}`).send({ locked: true, identity: joined.body.data.identity })).body.error.code).toBe('HOST_UNAUTHORIZED');
    }
    expect((await agent.post(`/api/sessions/${code}/participant-status`).send({ identity: joined.body.data.identity })).status).toBe(200);
    expect((await agent.post(`/api/sessions/${code}/leave`).set('Authorization', `Bearer ${joined.body.data.token}`).send({ identity: joined.body.data.identity })).status).toBe(200);
    // Ending a room still works after demo authorization expires: the room cookie controls it.
    accessStore.owners.clear();
    expect((await admin.post(`/api/sessions/${code}/host-token`)).status).toBe(200);
    expect((await admin.post(`/api/sessions/${code}/end`)).status).toBe(200);
    expect((await agent.post(`/api/sessions/${code}/join`).send({ name: 'Guest', pin: '1234' })).status).toBe(410);
  });
  it('binds status to the browser, prevents duplicate requests, approves temporarily and preserves Host separation', async () => {
    const visitor = client(); const admin = owner();
    const result = await visitor.post('/api/access-requests').send({ name: 'John', emailOrCompany: 'Company' });
    expect(result.status).toBe(201); const id = result.body.data.id as string;
    expect((await visitor.post('/api/access-requests').send({ name: 'Again' })).status).toBe(429);
    expect((await client().get(`/api/access-requests/${id}/status`)).status).toBe(404);
    const pending = await visitor.get(`/api/access-requests/${id}/status`);
    expect(pending.body.data.status).toBe('pending'); expect(JSON.stringify(pending.body)).not.toMatch(/John|Company|browserHash/);
    expect((await visitor.post(`/api/owner/access-requests/${id}/approve`)).status).toBe(401);
    expect((await admin.post(`/api/owner/access-requests/${id}/approve`)).status).toBe(200);
    expect((await visitor.get(`/api/access-requests/${id}/status`)).body.data.status).toBe('approved');
    expect((await visitor.get('/api/access')).body.data.authorized).toBe(true);
    const room = await admin.post('/api/sessions').send({ hostName: 'Owner host' });
    expect(room.status).toBe(201); const code = room.body.data.roomCode as string;
    expect((await visitor.post(`/api/sessions/${code}/join`).send({ name: 'John' })).status).toBe(200);
    expect((await visitor.post(`/api/sessions/${code}/host-token`)).body.error.code).toBe('HOST_UNAUTHORIZED');
    expect((await owner().post(`/api/sessions/${code}/lock`).send({ locked: true })).body.error.code).toBe('HOST_UNAUTHORIZED');
    expect((await visitor.post('/api/sessions').send({ hostName: 'John' })).status).toBe(201);
    accessStore.requests.get(id)!.expiresAt = Date.now() - 1;
    expect((await visitor.post('/api/sessions').send({ hostName: 'John' })).status).toBe(403);
    expect((await visitor.get(`/api/access-requests/${id}/status`)).body.data.status).toBe('expired');
  });
  it('denied and expired requests cannot authorize or be approved later', async () => {
    for (const expire of [false, true]) {
      const visitor = client(); const result = await visitor.post('/api/access-requests').send({ name: 'Test' });
      const id = result.body.data.id as string;
      if (expire) accessStore.requests.get(id)!.expiresAt = Date.now() - 1;
      else expect((await owner().post(`/api/owner/access-requests/${id}/deny`)).status).toBe(200);
      expect((await owner().post(`/api/owner/access-requests/${id}/approve`)).status).toBe(409);
      expect((await visitor.post('/api/sessions').send({ hostName: 'Test' })).status).toBe(403);
    }
  });
  it('limits public requests even when the browser clears its cookies', async () => {
    const agent = client();
    for (let i = 0; i < 5; i++) await agent.post('/api/access-requests').send({ name: '' });
    expect((await agent.post('/api/access-requests').send({ name: 'Test' })).status).toBe(429);
  });
  it('enforces atomic active-room and per-access creation limits', async () => {
    const visitor = approved();
    const results = await Promise.all(Array.from({ length: 3 }, () => visitor.post('/api/sessions').send({ hostName: 'Test', pin: '1234' })));
    expect(results.filter(result => result.status === 201)).toHaveLength(1);
    expect(results.filter(result => result.status === 409)).toHaveLength(2);
    sessionStore.clear(); accessStore.requests.get('approved')!.creations = 5;
    expect((await visitor.post('/api/sessions').send({ hostName: 'Test' })).body.error.code).toBe('DEMO_CREATION_LIMIT');
  });
  it('does not resurrect an ended session during an old room lookup', async () => {
    const admin = owner(); const created = await admin.post('/api/sessions').send({ hostName: 'Test' });
    const code = created.body.data.roomCode as string;
    await admin.post(`/api/sessions/${code}/end`);
    (await sessionStore.find(code))!.createdAt = new Date(Date.now() - 181 * 60000);
    expect((await admin.get(`/api/sessions/${code}/public`)).body.data.status).toBe('ENDED');
  });
  it('expires old sessions and refuses new media tokens', async () => {
    const admin = owner(); const created = await admin.post('/api/sessions').send({ hostName: 'Test' });
    const code = created.body.data.roomCode as string;
    (await sessionStore.find(code))!.createdAt = new Date(Date.now() - 181 * 60000);
    expect((await admin.post(`/api/sessions/${code}/host-token`)).status).toBe(410);
    expect((await client().post(`/api/sessions/${code}/join`).send({ name: 'Guest' })).status).toBe(410);
  });
});
describe('Owner Web Push', () => {
  it('registers and removes authenticated devices without listing secrets', async () => {
    const admin = owner();
    expect((await admin.post('/api/owner/push-subscriptions').send(subscription)).status).toBe(200);
    expect(accessStore.subscriptions.size).toBe(1);
    expect((await admin.post('/api/owner/push-subscriptions').send({ ...subscription, endpoint: 'https://127.0.0.1/private' })).status).toBe(400);
    expect(JSON.stringify((await admin.get('/api/owner/access-requests')).body)).not.toContain(subscription.endpoint);
    expect((await admin.delete('/api/owner/push-subscriptions').send({ endpoint: subscription.endpoint })).status).toBe(200);
    expect(accessStore.subscriptions.size).toBe(0);
  });
  it('requests trigger push, failure does not prevent creation, and gone endpoints are removed', async () => {
    accessStore.subscriptions.set('device', subscription);
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 410 });
    expect((await client().post('/api/access-requests').send({ name: 'John' })).status).toBe(201);
    expect(webpush.sendNotification).toHaveBeenCalledOnce();
    expect(accessStore.subscriptions.size).toBe(0);
    accessStore.subscriptions.set('device', subscription);
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 503 });
    await notifyOwner('John', 'test-request'); expect(accessStore.subscriptions.size).toBe(1);
  });
});

it('push contains only requester name, opaque record ID and fixed action metadata', async () => {
  accessStore.subscriptions.set('device', subscription);
  const result = await client().post('/api/access-requests').send({ name: 'John', emailOrCompany: 'private@example.com' });
  expect(result.status).toBe(201);
  const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0]![1] as string) as Record<string, unknown>;
  expect(payload).toEqual({ title: 'ViewCircle Access Request', body: 'John is requesting Host access.', requestId: result.body.data.id, actions: [{ action: 'approve', title: 'Approve' }, { action: 'deny', title: 'Deny' }] });
  expect(JSON.stringify(payload)).not.toContain('private@example.com');
});
it('worker-style mutations still require Owner cookies, CSRF and pending state', async () => {
  const visitor = client(); const created = await visitor.post('/api/access-requests').send({ name: 'Test' });
  const id = created.body.data.id as string; const path = `/api/owner/access-requests/${id}/approve`;
  expect((await client().set('Origin', env.CLIENT_URL).set('Sec-Fetch-Site', 'same-origin').post(path)).status).toBe(401);
  const admin = owner();
  expect((await admin.set('Origin', 'https://evil.example').post(path)).status).toBe(403);
  expect((await admin.set('Origin', env.CLIENT_URL).set('Sec-Fetch-Site', 'same-origin').post(path)).status).toBe(200);
  expect((await admin.post(path)).status).toBe(409);
});
