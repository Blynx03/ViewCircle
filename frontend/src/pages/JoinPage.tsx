import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { PrimaryButton, RoomCodeInput, TextField } from '../components/FormControls';
import { FriendlyError } from '../components/StatusViews';
import type { Credentials, PublicSession } from '../types/session';
import { guestNameFromFragment } from '../utilities/session-link';
import { normalizeRoomCode } from '../utilities/room-code';

export function JoinPage() {
  const params = useParams(); const navigate = useNavigate();
  const [code, setCode] = useState(() => normalizeRoomCode(params.roomCode ?? new URLSearchParams(window.location.search).get('room') ?? ''));
  const [name, setName] = useState(() => guestNameFromFragment(window.location.hash));
  const [session, setSession] = useState<PublicSession | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [available, setAvailable] = useState<Array<{ id: string; label: string }>>([]);
  const [waiting, setWaiting] = useState<{ id: string; roomCode: string; secret: string } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void api.available().then(v => { if (active) setAvailable(v); }).catch(() => undefined); };
    refresh(); const timer = setInterval(refresh, 5000); return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    if (code.length === 4) void api.getSession(code).then(v => {
      if (active) { setSession(v); if (['ENDED', 'EXPIRED'].includes(v.status)) setError('This invitation has expired. Ask the Host for a new session link.'); }
    }).catch(() => { if (active) { setSession(null); setError('This room code is invalid or has expired. Ask the Host for a new invitation.'); } });
    else setSession(null);
    return () => { active = false; };
  }, [code]);
  useEffect(() => {
    if (!waiting) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api.requestStatus(waiting.roomCode, waiting.id, waiting.secret);
        if (!active) return;
        if (result.credentials) { sessionStorage.setItem(`vc_guest_${waiting.roomCode}`, JSON.stringify(result.credentials)); void navigate(`/watch/${waiting.roomCode}`); return; }
        if (result.status === 'denied') { setWaiting(null); setError('The Host declined this request.'); return; }
      } catch (reason) { if (active) { setWaiting(null); setError((reason as Error).message); } return; }
      if (active) timer = setTimeout(() => void poll(), 2000);
    };
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [waiting, navigate]);
  const requestJoin = async (id: string) => {
    setBusy(true); setError('');
    try { const secret = crypto.randomUUID(); setWaiting({ ...await api.requestJoin(id, name, secret), secret }); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (session?.visibility === 'public') {
        const selected = session.discoveryId;
        if (!selected) throw new Error('This public session is no longer accepting requests.');
        await requestJoin(selected); return;
      }
      const credentials = await api.join(code, { name });
      sessionStorage.setItem(`vc_guest_${code}`, JSON.stringify(credentials satisfies Credentials)); void navigate(`/watch/${code}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not join this session.'); } finally { setBusy(false); }
  };
  return <AppLayout><section className="form-page"><div className="form-heading"><span className="eyebrow">JOIN AS A GUEST</span><h1>Enter the circle</h1><p>You’ll join muted. Turn your mic on whenever you’re ready.</p></div>
    <form className="card form-card" onSubmit={event => void submit(event)}>
      <TextField label="Your Name" value={name} onChange={event => setName(event.target.value)} maxLength={40} required autoComplete="name" />
      {waiting ? <div role="status"><p>Waiting for the Host to allow you…</p><button type="button" className="button" onClick={() => { void api.requestStatus(waiting.roomCode, waiting.id, waiting.secret, true).catch(() => undefined); setWaiting(null); }}>Cancel Request</button></div> : <>
        <h2>Available Sessions</h2>{available.length === 0 && <p>No Public sessions are available right now.</p>}
        {available.map(room => <article key={room.id} className="session-preview"><strong>{room.label}</strong><button type="button" className="button" disabled={busy || !name.trim()} onClick={() => void requestJoin(room.id)}>Request to Join</button></article>)}
        <h2>Have a Room Code?</h2><RoomCodeInput value={code} onChange={setCode} required />
        {session && <div className="session-preview"><strong>{session.sessionName || `${session.hostName}'s session`}</strong></div>}
        <PrimaryButton disabled={busy || code.length !== 4 || !name.trim()}>{busy ? 'JOINING…' : session?.visibility === 'public' ? 'REQUEST TO JOIN' : 'JOIN SESSION'}</PrimaryButton>
      </>}
      {error && <FriendlyError message={error} action="Check the room code or ask the Host." />}
    </form></section></AppLayout>;
}
