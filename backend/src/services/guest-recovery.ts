import type { Request, Response } from 'express';
import { TokenVerifier } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { sessionStore } from '../stores/session-store.js';
import { GUEST_RECONNECT_GRACE, MAX_DURATION, reconcileSession } from './session-expiry.js';
import { roomPresence } from './livekit-service.js';

const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
const cookie = 'vc_guest_recovery';
const options = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/sessions' };
export function rememberGuest(response: Response, token: string, expiresAt: number) {
  response.cookie(cookie, token, { ...options, maxAge: Math.max(0, Math.min(MAX_DURATION, expiresAt - Date.now())) });
}
export function forgetGuest(response: Response) { response.clearCookie(cookie, options); }

// Reuse only a server-issued Guest identity. A cookie never creates attendance,
// resets missingSince, admits a new Guest, or extends the session deadline.
export async function recoverableGuest(request: Request, response: Response) {
  response.set('Cache-Control', 'no-store');
  const token: unknown = request.cookies?.[cookie];
  if (typeof token !== 'string' || token.length > 8192) { forgetGuest(response); return null; }
  let identity: string; let code: string; let tokenExpires: number;
  try {
    const claims = await verifier.verify(token, 0);
    if (!claims.sub?.startsWith('guest-') || !claims.video?.room || claims.video.roomJoin !== true || !claims.exp) throw new Error('Invalid Guest');
    identity = claims.sub; code = claims.video.room; tokenExpires = claims.exp * 1000;
  } catch { forgetGuest(response); return null; }
  const session = await sessionStore.find(code);
  const eligible = () => session && ['LIVE', 'HOST_RECONNECTING'].includes(session.status) && !session.provisioning && !session.locked && Date.now() < Math.min(tokenExpires, session.createdAt.getTime() + MAX_DURATION);
  if (!eligible() || !session) { forgetGuest(response); return null; }
  // Fail closed on a media-control outage. Do not present stale eligibility.
  let presence: Awaited<ReturnType<typeof roomPresence>>;
  try { presence = await roomPresence(code); }
  catch (error) {
    const missing = error as { status?: number; code?: string };
    if (missing.status === 404 || missing.code === 'not_found') { forgetGuest(response); return null; }
    throw error;
  }
  await reconcileSession(session, Date.now(), presence);
  const guest = session.guests.get(identity);
  const now = Date.now();
  if (!eligible() || !guest || guest.removed || guest.connected !== true ||
      (guest.missingSince !== undefined && now >= guest.missingSince + GUEST_RECONNECT_GRACE)) {
    forgetGuest(response); return null;
  }
  return {
    roomCode: code, name: guest.name, identity,
    // Connected participants can refresh this validation; missing participants
    // retain their original absolute deadline even after pressing Rejoin.
    expiresAt: Math.min(tokenExpires, session.createdAt.getTime() + MAX_DURATION, (guest.missingSince ?? now) + GUEST_RECONNECT_GRACE),
    credentials: { token, identity, livekitUrl: env.LIVEKIT_URL }
  };
}
