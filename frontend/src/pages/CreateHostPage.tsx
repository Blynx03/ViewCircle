import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { FriendlyError } from '../components/StatusViews';
import { PrimaryButton, TextField } from '../components/FormControls';

export function CreateHostPage() {
  const navigate = useNavigate(); const [hostName, setHostName] = useState(''); const [sessionName, setSessionName] = useState('');
  const [privateRoom, setPrivateRoom] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [active, setActive] = useState<import('../types/session').PublicSession | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { void api.active().then(setActive).catch((reason: Error) => setError(reason.message)).finally(() => setChecking(false)); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (active && !window.confirm('End the existing session and disconnect its Guests before creating a new one?')) { setBusy(false); return; }
      const session = await api.createSession({ hostName, ...(sessionName.trim() ? { sessionName } : {}), visibility: privateRoom ? 'private' : 'public', ...(active ? { replace: true } : {}) });
      void navigate(`/host/${session.roomCode}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the session.'); void api.active().then(setActive).catch(() => undefined); setBusy(false); }
  };
  return <AppLayout><section className="form-page"><div className="form-heading"><span className="eyebrow">BECOME THE HOST</span><h1>Create your circle</h1><p>You’ll preview your camera before anyone sees it.</p></div>
    {active && <section className="card form-card"><h2>You already have an active session.</h2><p>{active.sessionName || active.roomCode}</p><button className="button button-primary" onClick={() => { void api.recover().then(s => navigate(`/host/${s.roomCode}`)).catch((reason: Error) => setError(reason.message)); }}>Rejoin Session</button><p>To replace it, complete the form below.</p></section>}
    <form className="card form-card" onSubmit={(event) => void submit(event)}>
      <TextField label="Your Name" value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={40} autoComplete="name" required autoFocus />
      <TextField label="Session Name (optional)" value={sessionName} onChange={(event) => setSessionName(event.target.value)} maxLength={60} placeholder="Sunday walk" />
      <p>{privateRoom ? 'Private: invite Guests with your room code or link.' : 'Public: Guests can discover your session and request your approval to join.'}</p>
      <label className="toggle-row"><span><strong>Private Session</strong><small>Only Guests with your room code or invitation link can enter.</small></span><input type="checkbox" checked={privateRoom} onChange={(event) => setPrivateRoom(event.target.checked)} /></label>
      {error && <FriendlyError message={error} action="Check your details and try again." />}
      <PrimaryButton disabled={busy || checking || !hostName.trim()}>{busy ? 'CREATING…' : active ? 'END IT & START NEW' : 'CREATE SESSION'}</PrimaryButton>
    </form></section></AppLayout>;
}
