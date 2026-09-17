import { createRoot } from 'react-dom/client';
import { GuestControls } from '../src/components/GuestControls';
import { ControlButton } from '../src/components/SessionControls';
import '../src/styles/global.css';
const query = new URLSearchParams(location.search);
const variant = query.get('variant');
const host = variant === 'host';
const noop = () => undefined;
createRoot(document.getElementById('root')!).render(<main className={`live-page ${host ? '' : 'guest-live'}`}>
  <header className="live-header"><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span>11 people</span><span>Reconnecting…</span></header>
  <section className="video-stage"><video className="host-video" /></section>
  {host ? <nav className="controls-bar" aria-label="Host controls">
    <ControlButton label="Mic On" icon="mic" active onClick={noop} />
    <ControlButton label="Camera On" icon="camera" active onClick={noop} />
    <ControlButton label="Sound Off" icon="sound" active={false} onClick={noop} />
    <ControlButton label="Flip" icon="flip" onClick={noop} />
    <ControlButton label="Guests 10" icon="people" onClick={noop} />
    <ControlButton label="Share" icon="share" onClick={noop} />
    <ControlButton label="Unlock" icon="lock" active onClick={noop} />
    <ControlButton label="End Session" icon="leave" danger onClick={noop} />
  </nav> : <GuestControls micOn={variant === 'active'} micBusy={variant === 'busy'} soundOn={variant === 'active'}
    iosStandalone={variant === 'safari'} pipSupported={variant !== 'hidden'} pipActive={variant === 'return'} hasVideo
    onMic={noop} onSound={noop} onPip={noop} onSafari={noop} onPeople={noop} onLeave={noop} />}
</main>);
