import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { FriendlyError } from '../components/StatusViews';
import { PinInput, PrimaryButton, TextField } from '../components/FormControls';

export function CreateHostPage() {
  const navigate = useNavigate(); const [hostName, setHostName] = useState(''); const [sessionName, setSessionName] = useState('');
  const [privateRoom, setPrivateRoom] = useState(false); const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const session = await api.createSession({ hostName, ...(sessionName.trim() ? { sessionName } : {}), ...(privateRoom ? { pin } : {}) });
      void navigate(`/host/${session.roomCode}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the session.'); setBusy(false); }
  };
  return <AppLayout><section className="form-page"><div className="form-heading"><span className="eyebrow">BECOME THE HOST</span><h1>Create your circle</h1><p>You’ll preview your camera before anyone sees it.</p></div>
    <form className="card form-card" onSubmit={(event) => void submit(event)}>
      <TextField label="Your Name" value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={40} autoComplete="name" required autoFocus />
      <TextField label="Session Name (optional)" value={sessionName} onChange={(event) => setSessionName(event.target.value)} maxLength={60} placeholder="Sunday walk" />
      <label className="toggle-row"><span><strong>Private Session</strong><small>Guests enter a PIN</small></span><input type="checkbox" checked={privateRoom} onChange={(event) => setPrivateRoom(event.target.checked)} /></label>
      {privateRoom && <PinInput value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required />}
      {error && <FriendlyError message={error} action="Check your details and try again." />}
      <PrimaryButton disabled={busy || !hostName.trim() || (privateRoom && pin.length !== 4)}>{busy ? 'CREATING…' : 'CREATE SESSION'}</PrimaryButton>
    </form></section></AppLayout>;
}
