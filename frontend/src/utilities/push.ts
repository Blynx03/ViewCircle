export function decodePushKey(key: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}
export function subscriptionMatchesKey(subscription: PushSubscription, key: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = decodePushKey(key); const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}
export async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Service worker unavailable.')), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
