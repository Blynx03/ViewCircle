// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
function worker(windows: unknown[] = [], maxActions = 2) {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => undefined); const openWindow = vi.fn(async () => undefined);
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
  runInNewContext(source, { URL, AbortController, setTimeout, clearTimeout, fetch, Notification: { maxActions }, self: { location: { origin: 'https://viewcircle.example' }, addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler), registration: { showNotification }, clients: { matchAll: async () => windows, openWindow } } });
  return { handlers, showNotification, openWindow, fetch };
}
describe('Owner service worker notifications', () => {
  it('shows a visible fallback even for malformed push data', async () => {
    const sw = worker(); let work: Promise<unknown> | undefined;
    sw.handlers.get('push')!({ data: { json: () => { throw new Error('bad'); } }, waitUntil: (value: Promise<unknown>) => { work = value; } });
    await work;
    expect(sw.showNotification).toHaveBeenCalledWith('ViewCircle Access Request', expect.objectContaining({ body: 'A visitor is requesting demo access.' }));
  });
  it('focuses an existing Owner window', async () => {
    const focus = vi.fn(); const sw = worker([{ url: 'https://viewcircle.example/owner', focus }]); let work: Promise<unknown> | undefined;
    sw.handlers.get('notificationclick')!({ notification: { close: vi.fn() }, waitUntil: (value: Promise<unknown>) => { work = value; } });
    await work; expect(focus).toHaveBeenCalledOnce(); expect(sw.openWindow).not.toHaveBeenCalled();
  });
  it('opens a credential-free Owner route without navigating an active live room', async () => {
    const navigate = vi.fn(); const sw = worker([{ url: 'https://viewcircle.example/watch/ABCD', navigate }]); let work: Promise<unknown> | undefined;
    sw.handlers.get('notificationclick')!({ notification: { close: vi.fn() }, waitUntil: (value: Promise<unknown>) => { work = value; } });
    await work; expect(sw.openWindow).toHaveBeenCalledWith('/owner'); expect(navigate).not.toHaveBeenCalled();
  });
});

const id = '12345678-1234-1234-1234-123456789abc';
async function dispatch(sw: ReturnType<typeof worker>, type: string, fields: object) {
  let work: Promise<unknown> | undefined;
  sw.handlers.get(type)!({ ...fields, waitUntil: (value: Promise<unknown>) => { work = value; } });
  await work;
}
describe('protected notification decisions', () => {
  it('offers fixed actions with a record identifier and separate request tags', async () => {
    const sw = worker();
    await dispatch(sw, 'push', { data: { json: () => ({ requestId: id, body: 'John is requesting demo access.' }) } });
    expect(sw.showNotification).toHaveBeenCalledWith('ViewCircle Access Request', expect.objectContaining({
      actions: [{ action: 'approve', title: 'Approve' }, { action: 'deny', title: 'Deny' }], data: { requestId: id }, tag: `viewcircle-access-${id}`
    }));
  });
  it('omits unsupported actions and retries display without action options if rejected', async () => {
    const unsupported = worker([], 0);
    await dispatch(unsupported, 'push', { data: { json: () => ({ requestId: id }) } });
    expect(unsupported.showNotification).toHaveBeenCalledWith('ViewCircle Access Request', expect.not.objectContaining({ actions: expect.anything() as unknown }));
    const sw = worker(); sw.showNotification.mockRejectedValueOnce(new Error('unsupported'));
    await dispatch(sw, 'push', { data: { json: () => ({ requestId: id }) } });
    expect(sw.showNotification).toHaveBeenCalledTimes(2);
  });
  it.each(['approve', 'deny'])('%s posts only to the existing same-origin protected endpoint', async action => {
    const sw = worker();
    await dispatch(sw, 'notificationclick', { action, notification: { close: vi.fn(), data: { requestId: id } } });
    expect(sw.fetch).toHaveBeenCalledWith(`/api/owner/access-requests/${id}/${action}`, expect.objectContaining({ method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', headers: { 'X-ViewCircle-Request': '1', 'Content-Type': 'application/json' } }));
    expect(sw.openWindow).not.toHaveBeenCalled();
  });
  it.each(['', 'unexpected', 'approve'])('does not mutate for body/unknown clicks or malformed identifiers (%s)', async action => {
    const sw = worker();
    await dispatch(sw, 'notificationclick', { action, notification: { close: vi.fn(), data: { requestId: '../../evil' } } });
    expect(sw.fetch).not.toHaveBeenCalled(); expect(sw.openWindow).toHaveBeenCalledWith('/owner');
  });
  it('falls back to authenticated manual review after rejection without retrying', async () => {
    const sw = worker(); sw.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) });
    await dispatch(sw, 'notificationclick', { action: 'deny', notification: { close: vi.fn(), data: { requestId: id } } });
    expect(sw.fetch).toHaveBeenCalledOnce();
    expect(sw.openWindow).toHaveBeenCalledWith(`/owner#request=${id}&intent=deny`);
    expect(sw.showNotification).toHaveBeenCalledWith('ViewCircle Access Request', expect.objectContaining({ data: { requestId: id, intent: 'deny' } }));
  });
  it('preserves a fresh-click fallback when network and window opening fail', async () => {
    const sw = worker(); sw.fetch.mockRejectedValueOnce(new Error('offline')); sw.openWindow.mockRejectedValueOnce(new Error('activation expired'));
    await dispatch(sw, 'notificationclick', { action: 'approve', notification: { close: vi.fn(), data: { requestId: id } } });
    expect(sw.showNotification).toHaveBeenCalledOnce();
    await dispatch(sw, 'notificationclick', { action: '', notification: { close: vi.fn(), data: { requestId: id, intent: 'approve' } } });
    expect(sw.fetch).toHaveBeenCalledOnce();
    expect(sw.openWindow).toHaveBeenLastCalledWith(`/owner#request=${id}&intent=approve`);
  });
});
