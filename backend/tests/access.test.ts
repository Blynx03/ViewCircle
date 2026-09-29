import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/services/livekit-service.js', async load => ({ ...await load<typeof import('../src/services/livekit-service.js')>(), closeRoom: vi.fn(), expireRoom: vi.fn(async () => undefined), provisionRoom: vi.fn(async () => undefined), roomPresence: vi.fn(async () => []), removeParticipant: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn(async () => ({})) } }));
import webpush from 'web-push';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { memoryAccessStore as accessStore } from '../src/access/store.js';
import { accessRequestProtection, ACCESS_REQUEST_LIMITS } from '../src/access/protection.js';
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
  accessStore.clear(); sessionStore.clear(); accessRequestProtection.reset(); vi.clearAllMocks();
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
    expect((await visitor.post('/api/access-requests').send({ name: 'Again' })).body.data).toMatchObject({ id, status: 'pending' });
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
  it('counts only valid new requests and protects a shared IP when cookies are cleared', async () => {
    const address = '198.51.100.7';
    const submit = (name: string) => request(app).post('/api/access-requests').set('X-ViewCircle-Request', '1').set('X-Forwarded-For', address).send({ name });
    for (let i = 0; i < 6; i++) expect((await submit('')).status).toBe(400);
    expect(accessRequestProtection.status().newRequests).toBe(0);
    for (let i = 0; i < ACCESS_REQUEST_LIMITS.ip; i++) expect((await submit('New browser')).status).toBe(201);
    const blocked = await submit('New browser');
    expect(blocked.status).toBe(429); expect(blocked.body.error.code).toBe('ACCESS_REQUEST_THROTTLED');
    expect(blocked.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBe(blocked.body.error.retryAfterSeconds);
    expect(accessRequestProtection.status().newRequests).toBe(ACCESS_REQUEST_LIMITS.ip);
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

it('bootstraps an HttpOnly identity and deduplicates concurrent/lost-response retries without extra pushes or counts', async () => {
  accessStore.subscriptions.set('device', subscription);
  const browser = client(); const boot = await browser.get('/api/access');
  expect(boot.headers['set-cookie']?.[0]).toContain('HttpOnly');
  const results = await Promise.all(Array.from({ length: 8 }, () => client().set('Cookie', boot.headers['set-cookie']![0]!.split(';')[0]!).post('/api/access-requests').send({ name: 'Host' })));
  expect(results.filter(result => result.status === 201)).toHaveLength(1);
  expect(new Set(results.map(result => result.body.data.id as string)).size).toBe(1);
  expect(accessStore.requests.size).toBe(1); expect(accessRequestProtection.status().newRequests).toBe(1);
  expect(webpush.sendNotification).toHaveBeenCalledOnce();
  const id = results[0]!.body.data.id as string;
  for (let i = 0; i < 35; i++) {
    expect((await browser.post('/api/access-requests').send({})).body.data).toMatchObject({ id, status: 'pending', message: 'Your access request is already waiting for approval.' });
    expect((await browser.get(`/api/access-requests/${id}/status`)).status).toBe(200);
  }
  await owner().post(`/api/owner/access-requests/${id}/approve`);
  const expires = accessStore.requests.get(id)!.expiresAt;
  expect((await browser.post('/api/access-requests').send({})).body.data).toMatchObject({ id, status: 'approved', message: 'Access already granted.' });
  expect(accessStore.requests.get(id)!.expiresAt).toBe(expires);
  expect(accessRequestProtection.status().newRequests).toBe(1);
  // Existing approval survives room end and can create another room, with usage retained.
  const first = await browser.post('/api/sessions').send({ hostName: 'Host' });
  expect(first.status).toBe(201);
  expect((await browser.post(`/api/sessions/${first.body.data.roomCode}/end`)).status).toBe(200);
  expect((await browser.post('/api/sessions').send({ hostName: 'Host' })).status).toBe(201);
  expect(accessStore.requests.get(id)!.creations).toBe(2);
});
it('denied, expired and cleared workflows can retry immediately, while repeated new workflows eventually throttle', async () => {
  const browser = client(); const admin = owner();
  for (let i = 0; i < ACCESS_REQUEST_LIMITS.browser; i++) {
    const result = await browser.post('/api/access-requests').send({ name: 'Host' });
    expect(result.status).toBe(201);
    const item = accessStore.requests.get(result.body.data.id as string)!;
    if (i === 0) await admin.post(`/api/owner/access-requests/${item.id}/deny`);
    else if (i === 1) item.expiresAt = Date.now() - 1;
    else accessStore.requests.delete(item.id);
  }
  expect((await browser.post('/api/access-requests').send({ name: 'Host' })).status).toBe(429);
  expect((await admin.post('/api/owner/access-request-protection/reset')).status).toBe(200);
  expect((await browser.post('/api/access-requests').send({ name: 'Host' })).status).toBe(201);
});
it('global creation protection cannot block reuse, and Owner reset preserves workflow, rooms, usage and login lockout', async () => {
  const pending = client(); const pendingResult = await pending.post('/api/access-requests').send({ name: 'Pending' });
  const authorized = approved(); const admin = owner();
  const room = await authorized.post('/api/sessions').send({ hostName: 'Host' }); expect(room.status).toBe(201);
  const approval = accessStore.requests.get('approved')!;
  const ownerState = accessStore.owners.get(digest('owner-test'))!; ownerState.creations = 3;
  const blockedLogin = client();
  for (let i = 0; i < 5; i++) expect((await blockedLogin.post('/api/owner/login').send({ username: 'test-owner', password: 'wrong' })).status).toBe(401);
  for (let i = 1; i < ACCESS_REQUEST_LIMITS.global; i++) accessRequestProtection.consume(`browser-${i}`, `ip-${i}`);
  const blocked = client(); const failure = await blocked.post('/api/access-requests').send({ name: 'Blocked' });
  expect(failure.status).toBe(429); expect(failure.body.error.retryAfterSeconds).toBeGreaterThan(0);
  expect((await pending.post('/api/access-requests').send({})).body.data.id).toBe(pendingResult.body.data.id);
  expect((await authorized.post('/api/access-requests').send({})).body.data.status).toBe('approved');
  const status = await admin.get('/api/owner/access-request-protection');
  expect(status.body.data.lastThrottledAt).toBeGreaterThan(0);
  expect(Object.keys(status.body.data as Record<string, unknown>).sort()).toEqual(['browserBuckets', 'ipBuckets', 'lastThrottledAt', 'newRequests']);
  const reset = await admin.post('/api/owner/access-request-protection/reset');
  expect(reset.body.data).toEqual({ browserBuckets: 0, ipBuckets: 0, lastThrottledAt: null, newRequests: 0 });
  expect(accessStore.requests.get(pendingResult.body.data.id as string)?.status).toBe('pending');
  expect(accessStore.requests.get('approved')).toBe(approval); expect(approval.creations).toBe(1);
  expect(ownerState.creations).toBe(3); expect((await admin.get('/api/access')).body.data.owner).toBe(true);
  expect(sessionStore.all()).toHaveLength(1); expect(sessionStore.all()[0]!.status).not.toBe('ENDED');
  expect((await blocked.post('/api/access-requests').send({ name: 'Blocked' })).status).toBe(201);
  expect((await blockedLogin.post('/api/owner/login').send({ username: 'test-owner', password: 'test-only-password' })).status).toBe(429);
});
it('protects reset/status with Owner authentication and existing CSRF/source rules', async () => {
  const path = '/api/owner/access-request-protection/reset';
  expect((await client().post(path)).status).toBe(401);
  expect((await approved().post(path)).status).toBe(401);
  expect((await client().get('/api/owner/access-request-protection')).status).toBe(401);
  expect((await owner().post(path).unset('X-ViewCircle-Request')).status).toBe(403);
  expect((await owner().set('Origin', 'https://evil.example').post(path)).status).toBe(403);
  expect((await owner().set('Sec-Fetch-Site', 'cross-site').post(path)).status).toBe(403);
});
it('does not trust spoofed forwarding headers when proxy trust is disabled', async () => {
  app.set('trust proxy', false);
  for (let i = 0; i < 8; i++) expect((await client().post('/api/access-requests').send({ name: 'Host' })).status).toBe(201);
  expect(accessRequestProtection.status().ipBuckets).toBe(1);
});

it('does not adopt an arbitrary caller-chosen browser identity', async () => {
  const chosen = 'attacker-chosen-cookie';
  const result = await client().set('Cookie', `vc_visitor=${chosen}`).post('/api/access-requests').send({ name: 'Host' });
  expect(result.status).toBe(201);
  expect(accessStore.requests.get(result.body.data.id as string)!.browserHash).not.toBe(digest(chosen));
  expect((await client().set('Cookie', `vc_visitor=${chosen}`).get('/api/access')).body.data.request).toBeNull();
});
