import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ControlButton, OrientationControl } from '../components/SessionControls';
import { PermissionHelp } from '../components/PermissionHelp';
import { SessionEnded, WaitingForHost } from '../components/StatusViews';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import { useOrientation } from '../hooks/useOrientation';
import type { Credentials } from '../types/session';

export function WatchPage() {
  const { roomCode = '' } = useParams(); const navigate = useNavigate();
  const [credentials] = useState<Credentials | null>(() => { try { const stored = sessionStorage.getItem(`vc_guest_${roomCode}`); return stored ? JSON.parse(stored) as Credentials : null; } catch { return null; } });
  const live = useLiveRoom(credentials, undefined, 'user', roomCode); const orientation = useOrientation('portrait', `vc_orientation_${roomCode}_${credentials?.identity ?? ''}`);
  const pip = usePictureInPicture(live.videoRef, live.hasVideo, live.sessionEnded || live.removed); const fullscreen = useFullscreen(); const online = useNetworkStatus();
  const releaseOrientation = orientation.release;
  const [drawer, setDrawer] = useState(false); const [micHelp, setMicHelp] = useState(false); const [micBusy, setMicBusy] = useState(false);
  const local = live.participants.find((person) => person.identity === credentials?.identity);
  useEffect(() => { if (!credentials) void navigate(`/join/${roomCode}`, { replace: true }); }, [credentials, navigate, roomCode]);
  useEffect(() => () => releaseOrientation(), [releaseOrientation]);
  const clearOrientation = orientation.clear;
  useEffect(() => {
    if (live.sessionEnded || live.removed) {
      clearOrientation(); sessionStorage.removeItem(`vc_guest_${roomCode}`);
    }
  }, [live.sessionEnded, live.removed, clearOrientation, roomCode]);
  const mic = async () => {
    if (local?.micOn) { await live.setMic(false); return; }
    setMicBusy(true);
    try { await live.setMic(true); setMicHelp(false); }
    catch { setMicHelp(true); }
    finally { setMicBusy(false); }
  };
  if (live.sessionEnded || live.removed) return <main className="ended-page"><SessionEnded removed={live.removed} /></main>;
  if (!credentials) return null;
  return <main className={`live-page guest-live view-${orientation.orientation}`}><header className="live-header"><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span>{live.participants.length} people</span><span className={`connection ${online && live.connection === 'connected' ? 'ok' : ''}`}>{!online ? 'No internet' : live.connection === 'reconnecting' || live.connection === 'disconnected' ? 'Reconnecting…' : live.connection}</span></header>
    <section className="video-stage"><video ref={live.videoRef} muted playsInline autoPlay className="host-video" />{!live.hasVideo && <WaitingForHost />}
      {(orientation.message || fullscreen.message || pip.message || live.mediaMessage || live.videoPaused) && <p className="lifecycle-message" role="status">{live.videoPaused ? 'Video paused while ViewCircle is in the background' : live.mediaMessage || pip.message || fullscreen.message || orientation.message}</p>}<div ref={live.audioContainerRef} className="audio-container" />
      {live.audioBlocked && <button className="tap-audio" onClick={() => void live.enableAudio()}>TAP TO HEAR SESSION</button>}
    </section>
    <nav className="controls-bar guest-controls" aria-label="Guest controls">
      <ControlButton label={micBusy ? 'Requesting…' : local?.micOn ? 'Mic On' : 'Turn Mic On'} active={Boolean(local?.micOn)} disabled={micBusy} onClick={() => void mic()} />
      <ControlButton label={live.soundOn ? 'Sound On' : 'Sound Off'} active={live.soundOn} onClick={live.toggleSound} />
      <OrientationControl value={orientation.orientation} choose={(value) => void orientation.choose(value)} />
      {pip.supported && <ControlButton label={pip.active ? "Return to ViewCircle" : "Picture in Picture"} active={pip.active} disabled={!live.hasVideo && !pip.active} onClick={() => void pip.toggle()} />}
      {document.fullscreenEnabled && <ControlButton label="Full Screen" active={fullscreen.active} onClick={() => void fullscreen.toggle()} />}
      <ControlButton label="People" onClick={() => setDrawer(true)} />
      <ControlButton label="Leave" danger onClick={() => { orientation.clear(); void api.leave(roomCode, credentials.identity); sessionStorage.removeItem(`vc_guest_${roomCode}`); void navigate('/'); }} />
    </nav>
    {drawer && <div className="sheet-backdrop" onClick={() => setDrawer(false)}><section className="bottom-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setDrawer(false)}>Close</button><h2>In this circle — {live.participants.length}</h2><div className="guest-list">{live.participants.map((person) => <div key={person.identity}><span><strong>{person.name}</strong><small>{person.speaking ? 'Speaking' : person.micOn ? 'Mic On' : 'Muted'}</small></span></div>)}</div></section></div>}
    {micHelp && <PermissionHelp kind="microphone" guest busy={micBusy} retry={() => void mic()} close={() => setMicHelp(false)} />}
  </main>;
}
