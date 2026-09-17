import webpush from 'web-push';
import { env } from '../config/env.js';
import { accessStore } from './store.js';

export const pushConfigured = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
export async function notifyOwner(name: string, requestId: string): Promise<void> {
  if (!pushConfigured()) return;
  await Promise.allSettled((await accessStore.listSubscriptions()).map(async ([id, subscription]) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify({
        title: 'ViewCircle Access Request', body: `${name} is requesting demo access.`,
        requestId, actions: [{ action: 'approve', title: 'Approve' }, { action: 'deny', title: 'Deny' }]
      }), { vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, TTL: 1800, timeout: 5000 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await accessStore.deleteSubscription(id);
      // No endpoint, keys, or request identity in logs.
    }
  }));
}
