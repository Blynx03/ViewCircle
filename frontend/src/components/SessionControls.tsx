import type { OrientationPreference } from '../types/session';

export function ControlButton({ label, active, danger, onClick, disabled }: { label: string; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className={`control ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''}`} onClick={onClick} disabled={disabled}>{label}</button>;
}
export function OrientationControl({ value, choose }: { value: OrientationPreference; choose: (value: OrientationPreference) => void }) {
  return <ControlButton label={value === 'portrait' ? 'Portrait' : 'Landscape'} active onClick={() => choose(value === 'portrait' ? 'landscape' : 'portrait')} />;
}
