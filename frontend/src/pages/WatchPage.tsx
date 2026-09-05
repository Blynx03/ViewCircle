import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ControlButton, OrientationControl } from '../components/SessionControls';
import { PermissionHelp } from '../components/PermissionHelp';
import { SessionEnded, WaitingForHost } from '../components/StatusViews';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOrientation } from '../hooks/useOrientation';
import type { Credentials } from '../types/session';

export function WatchPage() {
  const { roomCode = '' } = useParams(); const navigate = useNavigate();
  const stored = sessionStorage.getItem(`vc_guest_${roomCode}`); const credentials = useMemo(() => stored ? JSON.parse(stored) as Credentials : null, [stored]);
  const live = useLiveRoom(credentials); const orientation = useOrientation(); const fullscreen = useFullscreen(); const online = useNetworkStatus();
  const releaseOrientation = orientation.release;
  const [ended, setEnded] = useState(false); const [removed, setRemoved] = useState(false); const [drawer, setDrawer] = useState(false); const [micHelp, setMicHelp] = useState(false); const [micBusy, setMicBusy] = useState(false);
  const local = live.participants.find((person) => person.identity === credentials?.identity);
  useEffect(() => { if (!credentials) void navigate(`/join/${roomCode}`, { replace: true }); }, [credentials, navigate, roomCode]);
  useEffect(() => {
    if (live.connection !== 'disconnected' || !credentials) return;
    void api.participantStatus(roomCode, credentials.identity).then((status) => {
      if (status.removed) setRemoved(true); else if (status.status === 'ENDED' || status.status === 'EXPIRED') setEnded(true);
    }).catch((reason: unknown) => { if ((reason as { code?: string }).code === 'SESSION_NOT_FOUND') setEnded(true); });
  }, [credentials, live.connection, roomCode]);
  useEffect(() => {
    const leave = () => { if (credentials) void api.leave(roomCode, credentials.identity); };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); releaseOrientation(); };
  }, [credentials, releaseOrientation, roomCode]);
  const mic = async () => {
    if (local?.micOn) { await live.setMic(false); return; }
    setMicBusy(true);
    try { await live.setMic(true); setMicHelp(false); }
    catch { setMicHelp(true); }
    finally { setMicBusy(false); }
  };
  if (ended || removed) return <main className="ended-page"><SessionEnded removed={removed} /></main>;
  if (!credentials) return null;
  return <main className="live-page guest-live"><header className="live-header"><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span>{live.participants.length} people</span><span className={`connection ${online && live.connection === 'connected' ? 'ok' : ''}`}>{!online ? 'No internet' : live.connection}</span></header>
    <section className="video-stage"><video ref={live.videoRef} playsInline autoPlay className="host-video" />{!live.hasVideo && <WaitingForHost />}<div ref={live.audioContainerRef} className="audio-container" />
      {live.audioBlocked && <button className="tap-audio" onClick={() => void live.enableAudio()}>TAP TO HEAR SESSION</button>}
    </section>
    <nav className="controls-bar guest-controls" aria-label="Guest controls">
      <ControlButton label={micBusy ? 'Requesting…' : local?.micOn ? 'Mic On' : 'Turn Mic On'} active={Boolean(local?.micOn)} disabled={micBusy} onClick={() => void mic()} />
      <ControlButton label={live.soundOn ? 'Sound On' : 'Sound Off'} active={live.soundOn} onClick={live.toggleSound} />
      <OrientationControl value={orientation.orientation} choose={(value) => void orientation.choose(value)} />
      <ControlButton label="Full Screen" active={fullscreen.active} onClick={() => void fullscreen.toggle()} />
      <ControlButton label="People" onClick={() => setDrawer(true)} />
      <ControlButton label="Leave" danger onClick={() => { void api.leave(roomCode, credentials.identity); sessionStorage.removeItem(`vc_guest_${roomCode}`); void navigate('/'); }} />
    </nav>
    {drawer && <div className="sheet-backdrop" onClick={() => setDrawer(false)}><section className="bottom-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setDrawer(false)}>Close</button><h2>In this circle — {live.participants.length}</h2><div className="guest-list">{live.participants.map((person) => <div key={person.identity}><span><strong>{person.name}</strong><small>{person.speaking ? 'Speaking' : person.micOn ? 'Mic On' : 'Muted'}</small></span></div>)}</div></section></div>}
    {micHelp && <PermissionHelp kind="microphone" guest busy={micBusy} retry={() => void mic()} close={() => setMicHelp(false)} />}
  </main>;
}
