import { timeLeft } from '../utilities/session-status';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { PublicSession } from '../types/session';

export function SessionLifecycle({ code, host = false, retryCamera, onEnded, mediaMessage }: { code: string; host?: boolean; retryCamera?: () => void; onEnded?: () => void; mediaMessage?: string }) {
  const [session, setSession] = useState<PublicSession | null>(null); const [now, setNow] = useState(Date.now());
  const [requests, setRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [review, setReview] = useState<'status' | 'requests' | null>(null);
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
  if (!session?.expiresAt) return host ? <aside className="session-lifecycle host-status-row" aria-label="Session status"><div className="host-status-actions" /><span className="session-time-left" aria-label="Time left">Time Left <strong>—</strong></span></aside> : null;
  const run = async (action: () => Promise<unknown>) => { try { setError(''); await action(); } catch (reason) { setError((reason as Error).message); } };
  const elapsed = now - new Date(session.createdAt!).getTime();
  const waitingEnd = new Date(session.createdAt!).getTime() + (session.keepWaiting ? 480_000 : 330_000) + (session.pendingExtension ?? 0);
  const deadline = session.hostMissingSince ? session.hostMissingSince + 120_000 : session.cameraMissingSince ? session.cameraMissingSince + 120_000 : session.aloneSince ? session.aloneSince + 120_000 : !session.everJoined ? waitingEnd : undefined;
  const ending = ['ENDED', 'EXPIRED'].includes(session.status);
  const waitingPrompt = host && !session.everJoined && elapsed >= 300_000;
  const notices = <>
    {ending ? <p role="alert">{session.endingReason || 'This session has ended.'}</p> : <>
      {host && session.expiresAt - now <= 30 * 60_000 && <p role="status">{session.expiresAt - now <= 60_000 ? 'Session ending in' : session.expiresAt - now <= 5 * 60_000 ? 'Less than 5 minutes remaining:' : session.expiresAt - now <= 10 * 60_000 ? 'Less than 10 minutes remaining:' : 'Less than 30 minutes remaining:'} {timeLeft(session.expiresAt, now)}</p>}
      {session.hostMissingSince && <p role="status">Host connection was interrupted. Waiting for Host to reconnect…</p>}
      {session.cameraMissingSince && <p role="status">Camera connection lost. ViewCircle is waiting for the camera to recover. {host && <button className="button" onClick={retryCamera}>Try Camera Again</button>}</p>}
      {host && session.aloneSince && dismissed !== session.aloneSince && <div role="status"><p>All guests have left. This session will automatically end in 2 minutes if nobody rejoins.</p><button className="button" onClick={() => setDismissed(session.aloneSince)}>Dismiss</button></div>}
      {waitingPrompt && <div role="status"><p>{session.keepWaiting ? 'No guests have joined. Waiting time is limited.' : 'No guests have joined yet. Do you want to keep waiting?'}</p>{!session.keepWaiting && <button className="button" onClick={() => void run(async () => setSession(await api.keepWaiting(code)))}>Keep Waiting</button>}</div>}
      {deadline && deadline - now <= 30_000 && <p role="alert">Session ending in {timeLeft(deadline, now)}</p>}
      {host && (waitingPrompt || session.aloneSince) && <button className="button button-danger" onClick={() => void run(() => api.end(code))}>End Session</button>}

    </>}{mediaMessage && <p role="status">{mediaMessage}</p>}{error && <p role="alert">{error}</p>}
  </>;
  if (!host) return <aside className="session-lifecycle" aria-label="Session status">{notices}</aside>;

  // Only presentation priority lives here; server timestamps and actions above
  // remain authoritative. Detailed notices share one explicit review surface.
  const summary = ending ? (session.endingReason || 'Session ended')
    : error || (deadline && deadline - now <= 30_000 ? `Ending in ${timeLeft(deadline, now)}`
      : session.hostMissingSince ? 'Host reconnecting'
      : session.cameraMissingSince ? 'Camera recovering'
      : waitingPrompt ? 'No guests yet'
      : session.aloneSince && dismissed !== session.aloneSince ? 'All guests have left'
      : mediaMessage || (session.expiresAt - now <= 30 * 60_000 ? `${timeLeft(session.expiresAt, now)} remaining` : ''));
  const decide = (ids: string[], allow: boolean) => run(async () => { await api.decide(code, ids, allow); setRequests(await api.requests(code)); });
  return <>
    <aside className="session-lifecycle host-status-row" aria-label="Session status">
      <div className="host-status-actions">
        {summary ? <><span className="host-status-summary" role="status" title={summary}>{summary}</span><button className="status-action" aria-label="Review session status" onClick={() => setReview('status')}>Details</button>
          {requests.length > 0 && !(deadline && deadline - now <= 30_000) && <button className="status-action" aria-label={`Review ${requests.length} waiting Guests`} onClick={() => setReview('requests')}>{requests.length} waiting</button>}</>
          : requests.length === 1 ? <div className="admission-inline"><button className="host-status-summary admission-name" aria-label={`Review request from ${requests[0]!.name}`} title={`${requests[0]!.name} wants to join`} onClick={() => setReview('requests')}>{requests[0]!.name} wants to join</button><button className="status-action status-allow" onClick={() => void decide([requests[0]!.id], true)}>Allow</button><button className="status-action" onClick={() => void decide([requests[0]!.id], false)}>Deny</button></div>
          : requests.length > 1 ? <div className="admission-inline"><span className="host-status-summary" role="status">{requests.length} guests waiting</span><button className="status-action" aria-label="Review waiting Guests" onClick={() => setReview('requests')}>Review</button></div> : null}
      </div>
      <span className="session-time-left" aria-label="Time left">Time Left <strong>{timeLeft(session.expiresAt, now)}</strong></span>
    </aside>
    {review && <StatusDialog title={review === 'requests' ? 'Guest requests' : 'Session status'} close={() => setReview(null)}>
      {review === 'status' ? <>{notices}{requests.length > 0 && <button className="button" onClick={() => setReview('requests')}>Review waiting Guests ({requests.length})</button>}</> : <div className="admission-review">
        {requests.length === 0 && <p>No Guests are waiting.</p>}
        {requests.map(r => <div className="admission-review-row" key={r.id}><span>{r.name}</span><button className="status-action status-allow" onClick={() => void decide([r.id], true)}>Allow</button><button className="status-action" onClick={() => void decide([r.id], false)}>Deny</button></div>)}
        {requests.length > 1 && <button className="button" onClick={() => { const ids = requests.map(r => r.id); void decide(ids, true); }}>Allow All Waiting</button>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </StatusDialog>}
  </>;
}

function StatusDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', ''); // DOM-only test environments.
    return () => { if (dialog?.open) dialog.close?.(); };
  }, []);
  return <dialog className="session-status-dialog" ref={ref} aria-label={title} onCancel={close}>
    <div className="status-dialog-heading"><h2>{title}</h2><button className="status-action" onClick={close}>Close</button></div>
    {children}
  </dialog>;
}
