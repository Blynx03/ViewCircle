import { useEffect, useRef, useState } from 'react';
import { ControlIcon, type ControlIconName } from './ControlIcon';

interface DockButtonProps {
  label: string; caption: string; icon: ControlIconName; onClick: () => void;
  pressed?: boolean; off?: boolean; danger?: boolean; disabled?: boolean;
}
export function DockButton({ label, caption, icon, onClick, pressed, off, danger, disabled }: DockButtonProps) {
  return <button type="button" className={`dock-button${danger ? ' is-danger' : ''}`} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    <ControlIcon name={icon} off={off} /><span>{caption}</span>
  </button>;
}
interface GuestControlsProps {
  panelOpen?: boolean; restoreSignal?: number;
  micOn: boolean; micBusy: boolean; soundOn: boolean;
  iosStandalone: boolean; pipSupported: boolean; pipActive: boolean; hasVideo: boolean;
  onMic: () => void; onSound: () => void;
  onPip: () => void; onSafari: () => void; onPeople: () => void; onLeave: () => void;
}
export function GuestControls(props: GuestControlsProps) {
  const [hidden, setHidden] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [activity, setActivity] = useState(0);
  const previousRestore = useRef(props.restoreSignal);
  const reset = () => setActivity(value => value + 1);
  useEffect(() => {
    if (previousRestore.current !== props.restoreSignal) {
      previousRestore.current = props.restoreSignal;
      setHidden(false); setActivity(value => value + 1);
    }
  }, [props.restoreSignal]);
  useEffect(() => {
    if (!pressing) return;
    const release = () => { setPressing(false); setActivity(value => value + 1); };
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    window.addEventListener('keyup', release); window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
      window.removeEventListener('keyup', release); window.removeEventListener('blur', release);
    };
  }, [pressing]);
  useEffect(() => {
    if (hidden || pressing || props.panelOpen || props.micBusy) return;
    const timer = setTimeout(() => setHidden(true), 4500);
    return () => clearTimeout(timer);
  }, [hidden, pressing, props.panelOpen, props.micBusy, activity]);
  return <nav className={`guest-dock${hidden ? ' guest-dock-hidden' : ''}`} aria-label="Guest controls" inert={hidden} aria-hidden={hidden}
    onPointerDown={() => { setPressing(true); reset(); }} onKeyDown={() => { setPressing(true); reset(); }}
    onClick={reset} onFocus={reset} onBlur={reset}>
    <DockButton label={props.micBusy ? 'Requesting microphone access' : props.micOn ? 'Mute microphone' : 'Turn microphone on'} caption={props.micBusy ? 'Wait…' : props.micOn ? 'Mic on' : 'Mic off'} icon="mic" pressed={props.micOn} off={!props.micOn} disabled={props.micBusy} onClick={props.onMic} />
    <DockButton label={props.soundOn ? 'Turn sound off' : 'Turn sound on'} caption={props.soundOn ? 'Sound on' : 'Sound off'} icon="sound" pressed={props.soundOn} off={!props.soundOn} onClick={props.onSound} />
    {props.iosStandalone ? <DockButton label="Continue while using other apps" caption="Safari" icon="safari" onClick={props.onSafari} />
      : (props.pipActive || (props.pipSupported && props.hasVideo)) && <DockButton label={props.pipActive ? 'Return to ViewCircle' : 'Picture in Picture'} caption={props.pipActive ? 'Return' : 'PiP'} icon="pip" pressed={props.pipActive} onClick={props.onPip} />}
    <DockButton label="Show people" caption="People" icon="people" onClick={props.onPeople} />
    <DockButton label="Leave session" caption="Leave" icon="leave" danger onClick={props.onLeave} />
  </nav>;
}
