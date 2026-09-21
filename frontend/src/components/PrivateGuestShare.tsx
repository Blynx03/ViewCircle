import { useEffect, useRef, useState } from 'react';
import { copyGuestCode, shareGuestInvitation } from '../utilities/guest-invitation';

/** Mounted only after the connected Guest's room is confirmed Private. */
export function PrivateGuestShare({ code }: { code: string }) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  const perform = async (copy: boolean) => {
    setMessage('');
    try { if (copy) await copyGuestCode(code); else await shareGuestInvitation(code); setMessage(copy ? 'Room code copied.' : typeof navigator.share === 'function' ? '' : 'Guest link copied.'); }
    catch (reason) { if ((reason as Error).name !== 'AbortError') setMessage(copy ? 'Could not copy. Share the room code shown here.' : 'Could not share. Share the room code shown here.'); }
  };
  return <>
    <button className="guest-room-invitation" aria-label={`Room ${code}, sharing options`} onClick={() => setOpen(true)}>Room <strong>{code}</strong></button>
    <dialog ref={dialog} className="session-status-dialog" aria-label="Share Private session" onCancel={() => setOpen(false)}>
      <div className="status-dialog-heading"><h2>Private session</h2><button className="status-action" onClick={() => setOpen(false)}>Close</button></div>
      <p>Room <strong>{code}</strong></p><p>Share this invitation only with trusted Guests.</p>
      <div className="private-share-actions"><button className="button" onClick={() => void perform(true)}>Copy Code</button><button className="button button-primary" onClick={() => void perform(false)}>Share Guest Link</button></div>
      {message && <p role="status">{message}</p>}
    </dialog>
  </>;
}
