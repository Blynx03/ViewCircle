import { DockButton } from './GuestControls';
import type { ControlIconName } from './ControlIcon';

export function ControlButton({ label, icon = 'mic', active, danger, onClick, disabled }: { label: string; icon?: ControlIconName; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return <DockButton label={label} caption={label} icon={icon} pressed={active} off={active === false && ['mic', 'sound', 'camera'].includes(icon)} danger={danger} onClick={onClick} disabled={disabled} />;
}
