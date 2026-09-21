import type { PublicSession } from '../types/session';
export function timeLeft(expiresAt: number, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  if (seconds < 60) return `0:${String(seconds).padStart(2, '0')}`;
  const minutes = Math.ceil(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
export function sessionLabel(s: PublicSession) {
  if (['EXPIRED', 'ENDED'].includes(s.status)) return 'Ending';
  if (s.hostMissingSince) return 'Host Reconnecting';
  if (s.cameraMissingSince) return 'Camera Recovering';
  if (s.aloneSince) return 'Host Alone';
  if (s.pendingRequests) return 'Join Requests Pending';
  return s.everJoined ? 'In Session' : 'Waiting for Guests';
}
