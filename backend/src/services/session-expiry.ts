import { TrackSource } from 'livekit-server-sdk';
import type { Session } from '../types/session.js';
import { sessionStore } from '../stores/session-store.js';
import { expireRoom, roomPresence } from './livekit-service.js';

export const GUEST_RECONNECT_GRACE = 120_000;
export const MAX_DURATION = 180 * 60_000;
const endings = new Map<string, Promise<void>>();
export function endSession(session: Session, reason = 'The session has ended.'): Promise<void> {
  if (session.status === 'ENDED') return Promise.resolve();
  const existing = endings.get(session.roomCode);
  if (existing) return existing;
  // Freeze admission before yielding. Failed media deletion remains retryable.
  session.status = 'EXPIRED'; session.endingReason = reason; session.requests?.clear();
  const task = expireRoom(session.roomCode).then(() => {
    session.status = 'ENDED'; session.endedAt = new Date();
    session.guests.clear();
    delete session.aloneSince; delete session.hostMissingSince; delete session.cameraMissingSince;
  }).finally(() => endings.delete(session.roomCode));
  endings.set(session.roomCode, task);
  return task;
}
export function waitingDeadline(session: Session): number {
  return session.createdAt.getTime() + (session.keepWaiting ? 480_000 : 330_000) + (session.pendingExtension ?? 0);
}
export function lifecycleReason(session: Session, now: number): string | undefined {
  if (session.status === 'EXPIRED') return session.endingReason ?? 'This session has ended.';
  if (now >= session.createdAt.getTime() + MAX_DURATION) return 'The three-hour session limit has been reached.';
  if (session.hostMissingSince !== undefined && now >= session.hostMissingSince + 120_000) return 'The Host did not reconnect in time.';
  if (session.cameraMissingSince !== undefined && now >= session.cameraMissingSince + 120_000) return 'The Host camera did not recover in time.';
  if (session.everJoined && session.aloneSince !== undefined && now >= session.aloneSince + 120_000) return 'All Guests have left.';
  if (!session.everJoined && now >= waitingDeadline(session)) return 'No Guests joined this session.';
}
export async function reconcileSession(session: Session, now = Date.now()): Promise<void> {
  if (session.status === 'ENDED') return;
  if (session.status === 'EXPIRED' || now >= session.createdAt.getTime() + MAX_DURATION) {
    await endSession(session, lifecycleReason(session, now)); return;
  }
  // Provisioning owns a reserved slot, but the room may not exist yet. An
  // overlapping presence sweep must not mistake that for external deletion.
  if (session.provisioning) { const reason = lifecycleReason(session, now); if (reason) await endSession(session, reason); return; }
  for (const [id, request] of session.requests ?? []) if (request.expiresAt <= now) session.requests?.delete(id);
  // An actionable request may extend the deadline, but never beyond ten minutes
  // from creation. A flood cannot keep an unattended room alive forever.
  if (!session.everJoined && [...session.requests?.values() ?? []].some(r => r.status === 'pending' || r.status === 'allowed')) {
    const base = session.createdAt.getTime() + (session.keepWaiting ? 480_000 : 330_000);
    session.pendingExtension = Math.max(session.pendingExtension ?? 0, Math.min(session.createdAt.getTime() + 600_000, now + 30_000) - base, 0);
  }
  try {
    const participants = await roomPresence(session.roomCode);
    if (['ENDED', 'EXPIRED'].includes(session.status)) return;
    const host = participants.find(p => p.identity === `host-${session.id}`);
    session.hostConnected = Boolean(host);
    if (host) {
      session.hostSeen = true; delete session.hostMissingSince;
      session.status = 'LIVE';
      const camera = host.tracks.some(t => t.source === TrackSource.CAMERA && !t.muted);
      if (camera && !session.cameraReportedLost) delete session.cameraMissingSince;
      else session.cameraMissingSince ??= now;
    } else if (session.hostSeen) { session.hostMissingSince ??= now; session.status = 'HOST_RECONNECTING'; }
    const guests = participants.filter(p => p.identity.startsWith('guest-') && session.guests.has(p.identity) && !session.guests.get(p.identity)?.removed);
    if (!host && guests.length) session.hostMissingSince ??= now;
    for (const guest of session.guests.values()) {
      // Allow issued tokens a short connection window, but do not count them as
      // actual attendance or cancel the first-Guest timer until media connects.
      if (guest.removed) { guest.connected = false; delete guest.missingSince; continue; }
      if (guests.some(p => p.identity === guest.identity)) {
        guest.connected = true; delete guest.missingSince;
      } else if (guest.connected === true || guest.missingSince !== undefined) {
        guest.missingSince ??= now;
        guest.connected = now < guest.missingSince + GUEST_RECONNECT_GRACE;
      } else if (now - guest.joinedAt.getTime() > 30_000) guest.connected = false;
    }
    const reconnecting = [...session.guests.values()].some(g => !g.removed && g.missingSince !== undefined && now < g.missingSince + GUEST_RECONNECT_GRACE);
    if (guests.length) session.everJoined = true;
    if (guests.length || reconnecting) delete session.aloneSince;
    else if (session.everJoined) session.aloneSince ??= now;
  } catch (error) {
    const missing = error as { status?: number; code?: string };
    if (missing.status === 404 || missing.code === 'not_found') { await endSession(session, 'This session is no longer available.'); return; }
    // Unknown presence is not proof of a disconnect. Existing deadlines still
    // run so a media control-plane outage cannot bypass the hard maximum.
  }
  const reason = lifecycleReason(session, now);
  if (reason) await endSession(session, reason);
}
export function createExpirySweep() {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try { await Promise.allSettled(sessionStore.all().filter(s => s.status !== 'ENDED').map(s => reconcileSession(s))); }
    finally { running = false; }
  };
}
