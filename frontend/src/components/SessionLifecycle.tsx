import { timeLeft } from '../utilities/session-status';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicSession } from '../types/session';

export function SessionLifecycle({ code, host = false, retryCamera, onEnded }: { code: string; host?: boolean; retryCamera?: () => void; onEnded?: () => void }) {
  const [session, setSession] = useState<PublicSession | null>(null); const [now, setNow] = useState(Date.now());
  const [requests, setRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState(''); const [dismissed, setDismissed] = useState<number>();
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const value = await api.getSession(code); if (active) setSession(value);
        if (host) { const waiting = await api.requests(code); if (active) setRequests(waiting); }
      } catch { /* The room's connection UI handles transient network failures. */ }
      if (active) timer = setTimeout(() => void refresh(), 2000);
    };
    void refresh(); const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearTimeout(timer); clearInterval(clock); };
  }, [code, host]);
  useEffect(() => { if (session && ['ENDED', 'EXPIRED'].includes(session.status)) onEnded?.(); }, [session, onEnded]);
  if (!session?.expiresAt) return null;
  const run = async (action: () => Promise<unknown>) => { try { setError(''); await action(); } catch (reason) { setError((reason as Error).message); } };
  const elapsed = now - new Date(session.createdAt!).getTime();
  const waitingEnd = new Date(session.createdAt!).getTime() + (session.keepWaiting ? 480_000 : 330_000) + (session.pendingExtension ?? 0);
  const deadline = session.hostMissingSince ? session.hostMissingSince + 120_000 : session.cameraMissingSince ? session.cameraMissingSince + 120_000 : session.aloneSince ? session.aloneSince + 120_000 : !session.everJoined ? waitingEnd : undefined;
  const ending = ['ENDED', 'EXPIRED'].includes(session.status);
  const waitingPrompt = host && !session.everJoined && elapsed >= 300_000;
  return <aside className="session-lifecycle" aria-label="Session status">
    {host && <span>Time Left: {timeLeft(session.expiresAt, now)}</span>}
    {ending ? <p role="alert">{session.endingReason || 'This session has ended.'}</p> : <>
      {host && session.expiresAt - now <= 30 * 60_000 && <p role="status">{session.expiresAt - now <= 60_000 ? 'Session ending in' : session.expiresAt - now <= 5 * 60_000 ? 'Less than 5 minutes remaining:' : session.expiresAt - now <= 10 * 60_000 ? 'Less than 10 minutes remaining:' : 'Less than 30 minutes remaining:'} {timeLeft(session.expiresAt, now)}</p>}
      {session.hostMissingSince && <p role="status">Host connection was interrupted. Waiting for Host to reconnect…</p>}
      {session.cameraMissingSince && <p role="status">Camera connection lost. ViewCircle is waiting for the camera to recover. {host && <button className="button" onClick={retryCamera}>Try Camera Again</button>}</p>}
      {host && session.aloneSince && dismissed !== session.aloneSince && <div role="status"><p>All guests have left. This session will automatically end in 2 minutes if nobody rejoins.</p><button className="button" onClick={() => setDismissed(session.aloneSince)}>Dismiss</button></div>}
      {waitingPrompt && <div role="status"><p>{session.keepWaiting ? 'No guests have joined. Waiting time is limited.' : 'No guests have joined yet. Do you want to keep waiting?'}</p>{!session.keepWaiting && <button className="button" onClick={() => void run(async () => setSession(await api.keepWaiting(code)))}>Keep Waiting</button>}</div>}
      {deadline && deadline - now <= 30_000 && <p role="alert">Session ending in {timeLeft(deadline, now)}</p>}
      {host && (waitingPrompt || session.aloneSince) && <button className="button button-danger" onClick={() => void run(() => api.end(code))}>End Session</button>}
      {host && requests.length > 0 && <section><h2>Guest requests</h2>{requests.map(r => <div key={r.id}><span>{r.name}</span><button className="button" onClick={() => void run(async () => { await api.decide(code, [r.id], true); setRequests(await api.requests(code)); })}>Allow</button><button className="button" onClick={() => void run(async () => { await api.decide(code, [r.id], false); setRequests(await api.requests(code)); })}>Deny</button></div>)}{requests.length > 1 && <button className="button" onClick={() => { const ids = requests.map(r => r.id); void run(async () => { await api.decide(code, ids, true); setRequests(await api.requests(code)); }); }}>Allow All Waiting</button>}</section>}
    </>}{error && <p role="alert">{error}</p>}
  </aside>;
}
