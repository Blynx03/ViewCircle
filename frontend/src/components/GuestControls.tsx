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
  micOn: boolean; micBusy: boolean; soundOn: boolean;
  iosStandalone: boolean; pipSupported: boolean; pipActive: boolean; hasVideo: boolean;
  onMic: () => void; onSound: () => void;
  onPip: () => void; onSafari: () => void; onPeople: () => void; onLeave: () => void;
}
export function GuestControls(props: GuestControlsProps) {
  return <nav className="guest-dock" aria-label="Guest controls">
    <DockButton label={props.micBusy ? 'Requesting microphone access' : props.micOn ? 'Mute microphone' : 'Turn microphone on'} caption={props.micBusy ? 'Wait…' : props.micOn ? 'Mic on' : 'Mic off'} icon="mic" pressed={props.micOn} off={!props.micOn} disabled={props.micBusy} onClick={props.onMic} />
    <DockButton label={props.soundOn ? 'Turn sound off' : 'Turn sound on'} caption={props.soundOn ? 'Sound on' : 'Sound off'} icon="sound" pressed={props.soundOn} off={!props.soundOn} onClick={props.onSound} />
    {props.iosStandalone ? <DockButton label="Continue while using other apps" caption="Safari" icon="safari" onClick={props.onSafari} />
      : (props.pipActive || (props.pipSupported && props.hasVideo)) && <DockButton label={props.pipActive ? 'Return to ViewCircle' : 'Picture in Picture'} caption={props.pipActive ? 'Return' : 'PiP'} icon="pip" pressed={props.pipActive} onClick={props.onPip} />}
    <DockButton label="Show people" caption="People" icon="people" onClick={props.onPeople} />
    <DockButton label="Leave session" caption="Leave" icon="leave" danger onClick={props.onLeave} />
  </nav>;
}
