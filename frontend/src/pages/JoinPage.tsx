import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { PinInput, PrimaryButton, RoomCodeInput, TextField } from '../components/FormControls';
import { FriendlyError } from '../components/StatusViews';
import type { Credentials, PublicSession } from '../types/session';
import { normalizeRoomCode } from '../utilities/room-code';

export function JoinPage() {
  const params = useParams(); const navigate = useNavigate(); const [code, setCode] = useState(normalizeRoomCode(params.roomCode ?? '')); const [name, setName] = useState('');
  const [pin, setPin] = useState(''); const [session, setSession] = useState<PublicSession | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (code.length === 4) void api.getSession(code).then(setSession).catch(() => setSession(null)); else setSession(null); }, [code]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const credentials = await api.join(code, { name, ...(session?.pinRequired ? { pin } : {}) });
      sessionStorage.setItem(`vc_guest_${code}`, JSON.stringify(credentials satisfies Credentials));
      void navigate(`/watch/${code}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not join this session.'); setBusy(false); }
  };
  return <AppLayout><section className="form-page"><div className="form-heading"><span className="eyebrow">JOIN AS A GUEST</span><h1>Enter the circle</h1><p>You’ll join muted. Turn your mic on whenever you’re ready.</p></div>
    <form className="card form-card" onSubmit={(event) => void submit(event)}>
      <RoomCodeInput value={code} onChange={setCode} required autoFocus={!params.roomCode} />
      {session && <div className="session-preview"><strong>{session.sessionName || `${session.hostName}'s session`}</strong><span>{session.status === 'LIVE' ? 'Live now' : 'Waiting for Host'}</span></div>}
      <TextField label="Your Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required autoComplete="name" autoFocus={Boolean(params.roomCode)} />
      {session?.pinRequired && <><span className="private-label">Private Session</span><PinInput value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} required /></>}
      {error && <FriendlyError message={error} action="Check the room code or ask the Host." />}
      <PrimaryButton disabled={busy || code.length !== 4 || !name.trim() || Boolean(session?.pinRequired && pin.length !== 4)}>{busy ? 'JOINING…' : 'JOIN SESSION'}</PrimaryButton>
    </form></section></AppLayout>;
}
