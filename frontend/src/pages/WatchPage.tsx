import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PortraitTip } from '../components/PortraitTip';
import { GuestVideoViewport } from '../components/GuestVideoViewport';
import { GuestControls } from '../components/GuestControls';
import { SafariMultitaskingHelp } from '../components/SafariMultitaskingHelp';
import { useBrowserEnvironment } from '../hooks/useBrowserEnvironment';
import { PermissionHelp } from '../components/PermissionHelp';
import { SessionEnded, WaitingForHost } from '../components/StatusViews';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import type { Credentials } from '../types/session';

export function WatchPage() {
  const { roomCode = '' } = useParams(); const navigate = useNavigate();
  const [credentials] = useState<Credentials | null>(() => { try { const stored = sessionStorage.getItem(`vc_guest_${roomCode}`); return stored ? JSON.parse(stored) as Credentials : null; } catch { return null; } });
  const live = useLiveRoom(credentials, undefined, 'user', roomCode);
  const pip = usePictureInPicture(live.videoRef, live.hasVideo, live.sessionEnded || live.removed); const online = useNetworkStatus();
  const { iosStandalone } = useBrowserEnvironment();
  const [zoomInteraction, setZoomInteraction] = useState(false);
  const [restoreControls, setRestoreControls] = useState(0);
  const [safariHelp, setSafariHelp] = useState(false);
  const [drawer, setDrawer] = useState(false); const [micHelp, setMicHelp] = useState(false); const [micBusy, setMicBusy] = useState(false);
  const local = live.participants.find((person) => person.identity === credentials?.identity);
  useEffect(() => { if (!credentials) void navigate(`/join/${roomCode}`, { replace: true }); }, [credentials, navigate, roomCode]);
  useEffect(() => {
    if (live.sessionEnded || live.removed) {
      sessionStorage.removeItem(`vc_guest_${roomCode}`);
    }
  }, [live.sessionEnded, live.removed, roomCode]);
  const mic = async () => {
    if (local?.micOn) { await live.setMic(false); return; }
    setMicBusy(true);
    try { await live.setMic(true); setMicHelp(false); }
    catch { setMicHelp(true); }
    finally { setMicBusy(false); }
  };
  if (live.sessionEnded || live.removed) return <main className="ended-page"><SessionEnded removed={live.removed} /></main>;
  if (!credentials) return null;
  return <main className="live-page guest-live"><header className="live-header"><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span>{live.participants.length} people</span><span className={`connection ${online && live.connection === 'connected' ? 'ok' : ''}`}>{!online ? 'No internet' : live.connection === 'reconnecting' || live.connection === 'disconnected' ? 'Reconnecting…' : live.connection}</span></header>
    <GuestVideoViewport sessionKey={`${roomCode}:${credentials.identity}`} onTap={() => setRestoreControls(value => value + 1)} onInteraction={setZoomInteraction}><video ref={live.videoRef} muted playsInline autoPlay className="host-video" />{!live.hasVideo && <WaitingForHost />}
      {(pip.message || live.mediaMessage || live.videoPaused) && <p className="lifecycle-message" role="status">{live.videoPaused ? 'Video paused while ViewCircle is in the background' : live.mediaMessage || pip.message}</p>}<div ref={live.audioContainerRef} className="audio-container" />
      {live.audioBlocked && <button className="tap-audio" onClick={() => void live.enableAudio()}>TAP TO HEAR SESSION</button>}
      <PortraitTip sessionKey={credentials.identity} hasVideo={live.hasVideo} />
    </GuestVideoViewport>
    <GuestControls restoreSignal={restoreControls} panelOpen={safariHelp || drawer || micHelp || zoomInteraction} micOn={Boolean(local?.micOn)} micBusy={micBusy} soundOn={live.soundOn}
      iosStandalone={iosStandalone} pipSupported={pip.supported} pipActive={pip.active} hasVideo={live.hasVideo}
      onMic={() => void mic()} onSound={live.toggleSound}
      onPip={() => void pip.toggle()} onSafari={() => setSafariHelp(true)} onPeople={() => setDrawer(true)}
      onLeave={() => { void api.leave(roomCode, credentials.identity, credentials.token).catch(() => {}); sessionStorage.removeItem(`vc_guest_${roomCode}`); void navigate('/'); }} />
    {safariHelp && <SafariMultitaskingHelp roomCode={roomCode} guestName={local?.name ?? ''} close={() => setSafariHelp(false)} />}
    {drawer && <div className="sheet-backdrop" onClick={() => setDrawer(false)}><section className="bottom-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setDrawer(false)}>Close</button><h2>In this circle — {live.participants.length}</h2><div className="guest-list">{live.participants.map((person) => <div key={person.identity}><span><strong>{person.name}</strong><small>{person.speaking ? 'Speaking' : person.micOn ? 'Mic On' : 'Muted'}</small></span></div>)}</div></section></div>}
    {micHelp && <PermissionHelp kind="microphone" guest busy={micBusy} retry={() => void mic()} close={() => setMicHelp(false)} />}
  </main>;
}
