export type MediaPermissionKind = 'camera' | 'microphone';

export function PermissionHelp({ kind, busy, retry, close, guest = false }: { kind: MediaPermissionKind; busy: boolean; retry: () => void; close: () => void; guest?: boolean }) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const insecure = !window.isSecureContext;
  const title = guest ? 'Microphone access is off' : kind === 'camera' ? 'Camera access is currently blocked' : 'Microphone access is currently blocked';
  const label = kind === 'camera' ? 'Camera' : 'Microphone';
  return <div className="modal-backdrop"><div className="modal permission-modal" role="dialog" aria-modal="true" aria-labelledby="permission-help-title">
    <span className="permission-icon" aria-hidden="true">●</span><h2 id="permission-help-title">{title}</h2>
    {guest && <p>You can still watch and listen.</p>}
    {insecure ? <><p>Your browser only allows {label.toLowerCase()} access from a secure HTTPS address.</p><ol><li>Open the HTTPS ViewCircle link.</li><li>Return to this screen and select <strong>Try Again</strong>.</li><li>Select <strong>Allow</strong> when your browser asks.</li></ol></>
      : isIOS ? <><p>Please allow {label} access for ViewCircle in Safari, then return here.</p><ol><li>Tap <strong>aA</strong> in Safari’s address bar.</li><li>Choose <strong>Website Settings</strong>.</li><li>Set <strong>{label}</strong> to <strong>Allow</strong>, then try again.</li></ol></>
      : <><p>Please allow {label} access for ViewCircle in your browser settings, then return here.</p><ol><li>Tap the icon beside the address bar.</li><li>Open <strong>Permissions</strong> or <strong>Site settings</strong>.</li><li>Set <strong>{label}</strong> to <strong>Allow</strong>, then try again.</li></ol></>}
    <div><button className="button" onClick={close}>{guest ? 'CONTINUE LISTENING' : 'NOT NOW'}</button><button className="button button-primary" disabled={busy || insecure} onClick={retry}>{busy ? 'CHECKING…' : 'TRY AGAIN'}</button></div>
  </div></div>;
}
