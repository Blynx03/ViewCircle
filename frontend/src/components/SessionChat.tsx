import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';

import { participantColor } from '../utilities/chat';
const TOPIC = 'viewcircle.chat.v1';
interface Message { id: number; name: string; text: string; color: string; received: number }
export function SessionChat({ roomRef, connection }: { roomRef: RefObject<Room | null>; connection: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const [unread, setUnread] = useState(0);
  const [below, setBelow] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const receive = (payload: Uint8Array, sender?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== TOPIC || !sender || payload.byteLength > 4096) return;
      try {
        const data: unknown = JSON.parse(new TextDecoder().decode(payload));
        if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') return;
        const text = data.text.trim();
        if (!text || text.length > 500) return;
        // Identity/name/color come from the authenticated SDK participant, never the payload.
        setMessages(previous => [...previous, { id: ++serial.current, name: sender.name || 'Guest', text, color: participantColor(sender.metadata), received: Date.now() }].slice(-100));
        if (sender.identity !== room.localParticipant.identity) {
          if (!expandedRef.current) setUnread(count => count + 1);
          else if (!nearBottom.current) setBelow(count => count + 1);
        }
      } catch { /* Ignore other/malformed data packets. */ }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [roomRef, connection]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    if (nearBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, expanded]);
  const toggle = () => {
    expandedRef.current = !expandedRef.current;
    setExpanded(expandedRef.current);
    if (expandedRef.current) { setUnread(0); setBelow(0); nearBottom.current = true; }
  };
  const latest = () => {
    nearBottom.current = true; setBelow(0);
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  };
  const send = async () => {
    const room = roomRef.current; const text = draft.trim();
    if (!room || connection !== 'connected' || !text || sending) return;
    setSending(true); setError('');
    try {
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ text })), { reliable: true, topic: TOPIC });
      if (!mounted.current) return;
      const sender = room.localParticipant;
      setMessages(previous => [...previous, { id: ++serial.current, name: sender.name || (sender.identity.startsWith('host-') ? 'Host' : 'Guest'), text, color: participantColor(sender.metadata), received: Date.now() }].slice(-100));
      setDraft('');
    } catch { if (mounted.current) setError('Message not sent. Please try again.'); }
    finally { if (mounted.current) setSending(false); }
  };
  return <aside className={`session-chat ${expanded ? 'is-expanded' : ''}`} aria-label="Session chat" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <button className={`chat-toggle ${unread ? 'has-unread' : ''}`} onClick={toggle} aria-expanded={expanded} aria-label={expanded ? 'Collapse chat' : `Open chat${unread ? `, ${unread} unread messages` : ''}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>{expanded ? 'Hide chat' : unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
    </button>
    {expanded && <><div className="chat-messages" ref={list} role="log" aria-label="Session messages" aria-live="polite" tabIndex={0} onScroll={() => { const element = list.current; if (element) { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; if (nearBottom.current) setBelow(0); } }}>
      {!messages.length && <p className="chat-empty">Say hello. Messages stay in this session.</p>}
      {messages.map(message => <p key={message.id} style={{ color: message.color, opacity: Math.max(0.45, 1 - Math.max(0, now - message.received) / 120000) }}><strong>{message.name}:</strong> {message.text}</p>)}
    </div>{below > 0 && <button className="chat-new-messages" onClick={latest}>↓ {below} new {below === 1 ? 'message' : 'messages'}</button>}<form onSubmit={event => { event.preventDefault(); void send(); }}><input aria-label="Message" placeholder="Message everyone…" value={draft} maxLength={500} onChange={event => setDraft(event.target.value)} enterKeyHint="send" autoComplete="off" /><button type="submit" disabled={sending || connection !== 'connected' || !draft.trim()}>Send</button></form>{error && <p className="chat-error" role="alert">{error}</p>}</>}
  </aside>;
}
