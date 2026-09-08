import type { OrientationPreference } from '../types/session';

export function ControlButton({ label, active, danger, onClick, disabled }: { label: string; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className={`control ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''}`} onClick={onClick} disabled={disabled}>{label}</button>;
}
export function OrientationControl({ value, choose }: { value: OrientationPreference; choose: (value: OrientationPreference) => void }) {
  return <div className="orientation-control" role="group" aria-label="Viewing orientation">
    <button type="button" className={`control ${value === 'portrait' ? 'is-active' : ''}`} aria-pressed={value === 'portrait'} onClick={() => choose('portrait')}>Portrait</button>
    <button type="button" className={`control ${value === 'landscape' ? 'is-active' : ''}`} aria-pressed={value === 'landscape'} onClick={() => choose('landscape')}>Landscape</button>
  </div>;
}
