const CACHE = 'viewcircle-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/pwa-192x192.png', '/pwa-512x512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || new URL(request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : undefined))));
});

// IDs select records, never authorize a decision. Only fixed actions/endpoints are used.
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decisionActions = [{ action: 'approve', title: 'Approve' }, { action: 'deny', title: 'Deny' }];
function validRequestId(value) { return typeof value === 'string' && requestIdPattern.test(value); }
async function showRequest(options) {
  try { await self.registration.showNotification('ViewCircle Access Request', options); }
  catch {
    // Some implementations reject action options rather than ignoring them.
    const { actions, ...fallback } = options;
    if (!actions) throw new Error('Notification unavailable');
    await self.registration.showNotification('ViewCircle Access Request', fallback);
  }
}
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? (event.data.json() || {}) : {}; } catch { /* Visible fallback. */ }
  const requestId = validRequestId(payload.requestId) ? payload.requestId : null;
  const maxActions = typeof Notification !== 'undefined' && typeof Notification.maxActions === 'number' ? Notification.maxActions : 2;
  event.waitUntil(showRequest({
    body: typeof payload.body === 'string' ? payload.body : 'A visitor is requesting demo access.',
    icon: '/pwa-192x192.png', badge: '/pwa-64x64.png',
    tag: requestId ? `viewcircle-access-${requestId}` : 'viewcircle-access-request',
    data: { requestId },
    ...(requestId && maxActions > 0 ? { actions: decisionActions.slice(0, maxActions) } : {})
  }));
});
async function openOwner(requestId, intent) {
  // Fragment is UI context only: OwnerPage never executes it as a command.
  const target = validRequestId(requestId) && ['approve', 'deny'].includes(intent)
    ? `/owner#request=${requestId}&intent=${intent}` : '/owner';
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const owner = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === '/owner');
  if (owner) {
    if (target !== '/owner') await owner.navigate(target);
    await owner.focus(); return;
  }
  // Never navigate an active Host/Guest room away.
  await self.clients.openWindow(target);
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const requestId = event.notification.data?.requestId;
    const action = event.action;
    if (!['approve', 'deny'].includes(action) || !validRequestId(requestId)) {
      await openOwner(requestId, event.notification.data?.intent); return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/owner/access-requests/${requestId}/${action}`, {
        method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
        headers: { 'X-ViewCircle-Request': '1', 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      const result = await response.json();
      if (response.ok && result.success === true) return;
    } catch { /* No retry: a lost response may follow a completed decision. */ }
    finally { clearTimeout(timer); }
    // Async fetch can consume window-opening activation. Keep a visible fallback
    // whose next body tap supplies a fresh user gesture even if opening fails.
    await showRequest({ body: 'Could not confirm the decision. Open Owner to review this request.',
      icon: '/pwa-192x192.png', tag: `viewcircle-access-${requestId}`, data: { requestId, intent: action } });
    try { await openOwner(requestId, action); } catch { /* Tap the review notification. */ }
  })());
});
