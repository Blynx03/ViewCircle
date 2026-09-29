import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type GuestRecovery } from '../api/client';

export function GuestRejoin() {
  const navigate = useNavigate();
  const [context, setContext] = useState<GuestRecovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (dismissed) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      let poll = false;
      try { const value = await api.guestRecovery(); poll = Boolean(value); if (active) setContext(value && value.expiresAt > Date.now() ? value : null); }
      catch { if (active) setContext(null); }
      finally { checking = false; if (active) { clearTimeout(timer); if (poll) timer = setTimeout(() => void check(), 5000); } }
    };
    const foreground = () => { if (document.visibilityState === 'visible') { setContext(null); void check(); } };
    void check(); document.addEventListener('visibilitychange', foreground);
    window.addEventListener('pageshow', foreground);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('pageshow', foreground); };
  }, [dismissed]);
  useEffect(() => {
    if (!context) return;
    const timer = setTimeout(() => setContext(null), Math.max(0, context.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [context]);
  const rejoin = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.rejoinGuest();
      if (!result) { setContext(null); return; }
      sessionStorage.setItem(`vc_guest_${result.roomCode}`, JSON.stringify(result.credentials));
      void navigate(`/watch/${result.roomCode}`);
    } catch { setError('Could not reconnect. Please try again.'); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true);
    try { await api.dismissGuestRecovery(); setDismissed(true); setContext(null); }
    catch { setError('Could not dismiss. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!context || dismissed) return null;
  return <section className="card form-card guest-rejoin" aria-label="Guest session recovery"><h2>Rejoin session?</h2><p>You were recently connected to this session.</p><button className="button button-primary" disabled={busy} onClick={() => void rejoin()}>Rejoin Session</button><button className="button" disabled={busy} onClick={() => void dismiss()}>Not Now</button>{error && <p role="alert">{error}</p>}</section>;
}
