import { request } from '../api/client';
import type { PublicSession } from '../types/session';
import { timeLeft, sessionLabel } from '../utilities/session-status';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { decodePushKey, subscriptionMatchesKey, readyServiceWorker } from '../utilities/push';
import { accessApi, type AccessItem } from '../api/access';

export function OwnerPage() {
  const { hash } = useLocation();
  const notificationContext = new URLSearchParams(hash.slice(1));
  const requestedId = notificationContext.get('request');
  const intendedAction = notificationContext.get('intent');
  const reviewId = requestedId && /^[0-9a-f-]{36}$/i.test(requestedId) && ['approve', 'deny'].includes(intendedAction ?? '') ? requestedId : null;
  const [showPassword, setShowPassword] = useState(false);
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [owner, setOwner] = useState<boolean | null>(null);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [items, setItems] = useState<AccessItem[]>([]);
  const [filter, setFilter] = useState('pending'); const [push, setPush] = useState('');
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let active = true; void accessApi.status().then(value => { if (active) setOwner(value.owner); }).catch(() => { if (active) { setOwner(false); setError('Could not check Owner session.'); } }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!owner) return;
    setEnabled(false); setPush('');
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { const result = await accessApi.list(); if (active) setItems(result); const rooms = await request<{ sessions: PublicSession[] }>('/owner/sessions'); if (active) setSessions(rooms.sessions); }
      catch (reason) { if (active) { setError((reason as Error).message); if ((reason as { code?: string }).code === 'OWNER_REQUIRED') setOwner(false); } }
      finally { if (active) timer = setTimeout(() => void refresh(), 5000); }
    };
    void refresh();
    void accessApi.pushKey().then(async result => {
      if (!active) return;
      setPushKey(result.publicKey);
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { setPush('Notifications unavailable on this device/browser'); return; }
      if (Notification.permission === 'denied') { setPush('Notifications denied. You can change this in device settings.'); return; }
      if (!result.publicKey) { setPush('Notifications are not configured on the server.'); return; }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!active) return;
      if (subscription && subscriptionMatchesKey(subscription, result.publicKey)) { await accessApi.subscribe(subscription); if (active) { setEnabled(true); setPush('Notifications enabled'); } }
      else if (subscription && active) setPush('Notification settings changed. Enable notifications again.');
    }).catch(() => { if (active) setPush('Could not check notifications. You can still manage requests here.'); });
    return () => { active = false; clearTimeout(timer); };
  }, [owner]);
  const enablePush = async () => {
    if (!pushKey || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { setPush('Notifications unavailable on this device/browser'); return; }
    setBusy(true);
    try {
      // Permission request stays directly inside the explicit tap, before network awaits.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPush('Notifications denied. You can change this in device settings.'); return; }
      await navigator.serviceWorker.register('/sw.js');
      const registration = await readyServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionMatchesKey(subscription, pushKey)) {
        await accessApi.unsubscribe(subscription.endpoint); await subscription.unsubscribe(); subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePushKey(pushKey) });
      await accessApi.subscribe(subscription); setEnabled(true); setPush('Notifications enabled');
    } catch { setPush('Could not enable notifications. You can still manage requests here.'); }
    finally { setBusy(false); }
  };
  const mutate = async (path: string, prompt: string) => {
    if (!window.confirm(prompt)) return; setBusy(true); setError('');
    try { await request(path, { method: 'POST' }); const result = await request<{ sessions: PublicSession[] }>('/owner/sessions'); setSessions(result.sessions); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  return <main className="app-shell owner-shell"><section className="owner-page"><h1>ViewCircle Owner</h1>{error && <p role="alert">{error}</p>}
    {owner === null ? <p>Checking Owner session…</p> : !owner ? <form className="card form-card" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void accessApi.login(username, password, remember).then(() => { setOwner(true); setPassword(''); }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
    }}>
      <label className="field">Username<input id="owner-username" name="username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
      <label className="field">Password<input id="owner-password" name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} required maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button type="button" className="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide Password' : 'Show Password'}</button>
      <label className="remember-choice"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Remember me</label>
      <button className="button button-primary" disabled={busy}>Owner Login</button>
    </form> : <>
      <div className="owner-actions"><Link className="button" to="/">Enter ViewCircle</Link><button className="button" disabled={busy} onClick={() => { setBusy(true); void accessApi.logout().then(() => { setOwner(false); setItems([]); }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)); }}>Logout</button></div>
      <section className="owner-sessions card form-card"><h2>Session Management</h2><p className="session-capacity">Active Sessions <strong>{sessions.length} of 2</strong></p>
        {sessions.map(s => <article className="owner-session" key={s.roomCode}><h3>{s.sessionName || s.roomCode}</h3><p>Room {s.roomCode} · {s.visibility === 'public' ? 'Public' : 'Private'} · {sessionLabel(s)}</p><p>Host {s.hostConnected ? 'connected' : 'disconnected'} · {s.guestCount} Guests · {s.pendingRequests ?? 0} pending requests</p><p>Started {s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'} · Time Left: {s.expiresAt ? timeLeft(s.expiresAt) : '—'}</p><button className="button button-danger" disabled={busy} onClick={() => void mutate(`/owner/sessions/${s.roomCode}/end`, 'End this session and disconnect everyone?')}>End Session</button></article>)}
        <div className="owner-actions"><button className="button button-danger" disabled={busy || sessions.length === 0} onClick={() => void mutate('/owner/sessions/end-all', 'End all active sessions and disconnect everyone?')}>End All Sessions</button><button className="button" disabled={busy} onClick={() => void mutate('/owner/reset-creations', 'Reset session-creation usage for all current Host authorizations?')}>Reset Host Creation Usage</button></div>
      </section>
      <p role="status">{push}</p>
      {enabled ? <button className="button" disabled={busy} onClick={() => {
        setBusy(true); void (async () => { const registration = await navigator.serviceWorker.getRegistration(); const sub = await registration?.pushManager.getSubscription(); if (sub) { await accessApi.unsubscribe(sub.endpoint); await sub.unsubscribe(); } setEnabled(false); setPush('Notifications disabled'); })().catch(() => setPush('Could not disable notifications. Try again.')).finally(() => setBusy(false));
      }}>Disable Access Notifications</button> : <button className="button" disabled={busy || !pushKey || !('Notification' in window) || Notification.permission === 'denied'} onClick={() => void enablePush()}>Enable Access Notifications</button>}
      {reviewId && <p role="status">Notification requested {intendedAction}. Review the highlighted request and choose Approve or Deny below. If it is no longer pending, check Recently approved or Recently denied.</p>}
      <h2>Access Requests</h2><div className="owner-actions" aria-label="Request status">{['pending', 'approved', 'denied'].map(value => <button className="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'pending' ? 'Pending' : `Recently ${value}`}</button>)}</div>
      <div className="access-list">{items.filter(item => item.status === filter).length === 0 && <p>No {filter} requests.</p>}{items.filter(item => item.status === filter).map(item => <article className="card form-card" key={item.id} style={item.id === reviewId ? { outline: '2px solid var(--accent-2)' } : undefined}>
        <strong>{item.name}</strong>{item.id === reviewId && <small>From notification — review {intendedAction}</small>}{item.emailOrCompany && <span>{item.emailOrCompany}</span>}<small>Requested {new Date(item.createdAt).toLocaleString()}</small>
        {item.status === 'pending' && <div className="owner-actions">{(['approve', 'deny'] as const).map(action => <button className={`button ${action === 'approve' ? 'button-live' : 'button-danger'}`} key={action} disabled={busy} onClick={() => {
          setBusy(true); setError(''); void accessApi.decide(item.id, action).then(() => accessApi.list()).then(setItems).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
        }}>{action === 'approve' ? 'Approve' : 'Deny'}</button>)}</div>}
      </article>)}</div>
    </>}
  </section></main>;
}
