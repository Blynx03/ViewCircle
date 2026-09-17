import { api } from '../api/client';
import { useEffect, useRef, useState } from 'react';
import { sessionJoinLink } from '../utilities/session-link';

export function SafariMultitaskingHelp({ roomCode, guestName, close }: { roomCode: string; guestName: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [locked, setLocked] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  useEffect(() => { let active = true; void api.getSession(roomCode).then(session => { if (active) setLocked(session.locked); }).catch(() => {}); return () => { active = false; }; }, [roomCode]);
  const link = sessionJoinLink(window.location.origin, roomCode, guestName);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopyMessage('Link copied'); }
    catch { setManualCopy(true); setCopyMessage('Touch and hold the link below, then choose Copy.'); }
  };
  return <dialog ref={dialog} className="safari-help" aria-labelledby="safari-help-title" onCancel={close}>
    <button type="button" className="sheet-close" onClick={close} aria-label="Close Safari instructions">Close</button>
    <h2 id="safari-help-title">Continue in Safari</h2>
    <p>For Picture-in-Picture and background two-way audio, continue this session in Safari.</p>
    <button type="button" className="button button-primary" onClick={() => void copy()}>Copy &amp; Continue</button>
    <p role="status">{copyMessage}</p>
    {copyMessage && <p>Leave ViewCircle, then open Safari and paste the link.</p>}
    {manualCopy && <label className="field"><span>Session link</span><input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>}
    {locked && <p className="hint">This session is locked. Ask the Host to unlock it before you leave.</p>}
  </dialog>;
}
