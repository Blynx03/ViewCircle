import { ApprovedHostName } from '../contexts/approved-host-name';
import { useEffect, useState, type ReactNode } from 'react';
import { accessApi, type AccessStatus } from '../api/access';

export function AccessGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(''); const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false; let inFlight = false; let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      let delay = 5000;
      setAccess(previous => previous?.authorized && previous.expiresAt && previous.expiresAt <= Date.now()
        ? { ...previous, authorized: false, request: previous.request ? { ...previous.request, status: 'expired' } : null } : previous);
      try {
        const result = await accessApi.status();
        if (!disposed) { setAccess(result); setError(previous => result.authorized || result.request?.status === 'pending' || previous === 'Could not check access. Retrying…' ? '' : previous); }
        if (result.authorized) delay = Math.max(250, Math.min(60000, (result.expiresAt ?? Date.now() + 60000) - Date.now()));
      } catch { if (!disposed) setError('Could not check access. Retrying…'); }
      finally { inFlight = false; if (!disposed) timer = setTimeout(() => void check(), delay); }
    };
    void check();
    const refresh = () => { clearTimeout(timer); if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [retry]);
  useEffect(() => {
    if (!access?.authorized || !access.expiresAt) return;
    const timer = setTimeout(() => setAccess(previous => previous && ({ ...previous, authorized: false,
      request: previous.request ? { ...previous.request, status: 'expired' } : null })), Math.max(0, access.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [access?.authorized, access?.expiresAt]);
  // Session creation is available only while backend-controlled Host access is valid.
  if (access?.authorized && (!access.expiresAt || access.expiresAt > Date.now())) return <ApprovedHostName.Provider value={access.requestorName ?? ''}>{notice && <p role="status">{notice}</p>}{children}</ApprovedHostName.Provider>;
  const status = access?.request?.status;
  return <main className="app-shell"><section className="form-page"><h1>ViewCircle</h1><p>Share your view. Stay connected.</p><div className="card form-card">
    <h2>Host Access</h2>
    {!access ? <p role="status">Checking access…</p> : status === 'pending' ? <div role="status"><h3>Access request sent</h3><p>Your access request is already waiting for approval.</p><p>Waiting for owner approval…</p></div>
      : <>{status === 'denied' ? <p role="status">Access was not approved.</p> : status === 'expired' ? <p role="status">Your access has expired. You can request access again.</p> : <p>Creating a session requires owner approval.</p>}
        <form className="access-form" onSubmit={event => {
          event.preventDefault(); setBusy(true); setError('');
          void accessApi.ask(name, company).then(result => { setNotice(result.status === 'approved' ? result.message ?? 'Access already granted.' : ''); setRetry(value => value + 1); }).catch((reason: Error & { retryAfterSeconds?: number }) => {
            const seconds = reason.retryAfterSeconds;
            const wait = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? ` Try again in about ${Math.ceil(seconds / 60)} ${seconds <= 60 ? 'minute' : 'minutes'}.` : '';
            setError(reason.message + wait);
          }).finally(() => setBusy(false));
        }}>
          <label className="field">Your Name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label>
          <label className="field">Email or Company (optional)<input maxLength={160} value={company} onChange={event => setCompany(event.target.value)} /></label>
          <button className="button button-primary" disabled={busy}>{busy ? 'Sending…' : 'Request Access'}</button>
        </form></>}
    {error && <p role="alert">{error}</p>}<small>Host access is approved by the Owner. Guests can join an available session or use an invitation.</small>
  </div></section></main>;
}
