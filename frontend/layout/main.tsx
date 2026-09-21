import { PrivateGuestShare } from '../src/components/PrivateGuestShare';
import { HostRoomHeader } from '../src/components/HostRoomHeader';
import { SessionLifecycle } from '../src/components/SessionLifecycle';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HostCameraZoom } from '../src/components/HostCameraZoom';
import { GuestVideoViewport } from '../src/components/GuestVideoViewport';
import { GuestControls } from '../src/components/GuestControls';
import { ControlButton } from '../src/components/SessionControls';
import '../src/styles/global.css';
const query = new URLSearchParams(location.search);
const variant = query.get('variant');
const host = variant === 'host';
const noop = () => undefined;
// Capability fixture only: browser tests exercise the actual UI/controller, not
// claim physical-camera or remote WebRTC validation.
let zoom = .5;
const camera = {
  readyState: 'live', enabled: true,
  getCapabilities: () => ({ zoom: { min: .5, max: 3.5, step: .25 } }),
  getSettings: () => ({ zoom }), getConstraints: () => ({}),
  applyConstraints: async (constraints: MediaTrackConstraints) => { zoom = (constraints.advanced?.at(-1) as { zoom: number }).zoom; },
} as unknown as MediaStreamTrack;
const getCamera = () => query.get('zoom') === 'supported' ? camera : null;
function Fixture() {
  const [gesture, setGesture] = useState(false);
  const [restore, setRestore] = useState(0);
  return <main className={`live-page ${host && query.has('status') ? 'host-live' : host ? '' : 'guest-live'}`}>
  {host && query.has('status') ? <><HostRoomHeader roomCode="AB7K" people={11} connection="Connected" connected /><SessionLifecycle code="AB7K" host /></> : <header className={`live-header ${variant === 'private' ? 'guest-private-header' : ''}`}><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span className="guest-people">11 people</span>{variant === 'private' && <PrivateGuestShare code="AB7K" />}<span className="connection">Reconnecting…</span></header>}
  {host ? <section className="video-stage"><video className="host-video" /><HostCameraZoom getTrack={getCamera} /></section>
    : <GuestVideoViewport sessionKey="layout" onTap={() => setRestore(value => value + 1)} onInteraction={setGesture}><video className="host-video" /></GuestVideoViewport>}
  {host ? <nav className="controls-bar" aria-label="Host controls">
    <ControlButton label="Mic On" icon="mic" active onClick={noop} />
    <ControlButton label="Camera On" icon="camera" active onClick={noop} />
    <ControlButton label="Sound Off" icon="sound" active={false} onClick={noop} />
    <ControlButton label="Flip" icon="flip" onClick={noop} />
    <ControlButton label="Guests 10" icon="people" onClick={noop} />
    <ControlButton label="Share" icon="share" onClick={noop} />
    <ControlButton label="Unlock" icon="lock" active onClick={noop} />
    <ControlButton label="End Session" icon="leave" danger onClick={noop} />
  </nav> : <GuestControls panelOpen={gesture} restoreSignal={restore} micOn={variant === 'active'} micBusy={variant === 'busy'} soundOn={variant === 'active'}
    iosStandalone={variant === 'safari'} pipSupported={variant !== 'hidden'} pipActive={variant === 'return'} hasVideo
    onMic={noop} onSound={noop} onPip={noop} onSafari={noop} onPeople={noop} onLeave={noop} />}
</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
