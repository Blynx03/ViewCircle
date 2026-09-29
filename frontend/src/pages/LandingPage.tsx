import { GuestRejoin } from '../components/GuestRejoin';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicSession } from '../types/session';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from '../config/brand';

export function LandingPage() {
  const navigate = useNavigate(); const [active, setActive] = useState<PublicSession | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const check = async () => { try { const value = await api.active(); if (mounted) setActive(value); } catch { /* Guest landing remains public. */ } };
    void check(); const foreground = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', foreground);
    return () => { mounted = false; document.removeEventListener('visibilitychange', foreground); };
  }, []);
  const recover = async (replace: boolean) => {
    if (!active || (replace && !window.confirm('End your existing session and disconnect its Guests before creating a replacement?'))) return;
    setBusy(true); setError('');
    try {
      const session = replace ? await api.createSession({ hostName: active.hostName, ...(active.sessionName ? { sessionName: active.sessionName } : {}), visibility: active.visibility ?? 'private', replace: true }) : await api.recover();
      void navigate(`/host/${session.roomCode}`);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  return <main className="landing">
    <div className="landing-glow" />
    <section className="landing-content">
      <div className="logo-mark" aria-hidden="true"><span /></div>
      <h1>{BRAND.appName}</h1><p className="tagline">{BRAND.tagline}</p>
      {active && <section className="card form-card"><h2>You already have an active session.</h2><p>{active.sessionName || active.roomCode}</p><button className="button button-primary" disabled={busy} onClick={() => void recover(false)}>Rejoin Session</button><button className="button" disabled={busy} onClick={() => void recover(true)}>End It &amp; Start New</button>{error && <p role="alert">{error}</p>}</section>}
      {!active && <GuestRejoin />}
      <nav className="role-actions" aria-label="Choose how to join">
        <Link className="role-card host-card" to="/host"><span className="role-icon">●</span><strong>HOST</strong><small>Share your camera</small></Link>
        <Link className="role-card" to="/join"><span className="role-icon">◉</span><strong>GUEST</strong><small>Watch and talk</small></Link>
      </nav>
    </section>
    <footer><strong>{BRAND.projectName}</strong><span>by {BRAND.creator}</span></footer>
  </main>;
}
