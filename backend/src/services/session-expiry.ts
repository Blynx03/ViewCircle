import { env } from '../config/env.js';
import { sessionStore } from '../stores/session-store.js';
import { expireRoom } from './livekit-service.js';

export function createExpirySweep() {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await Promise.allSettled(sessionStore.all().filter(session => session.status !== 'ENDED' && session.createdAt.getTime() + env.DEMO_MAX_SESSION_DURATION_MINUTES * 60_000 <= Date.now()).map(async session => {
        session.status = 'EXPIRED';
        await expireRoom(session.roomCode);
        session.status = 'ENDED'; session.endedAt = new Date();
      }));
    } finally { running = false; }
  };
}
