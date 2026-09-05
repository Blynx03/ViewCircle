import { Link } from 'react-router-dom';

export function FriendlyError({ message, action }: { message: string; action?: string }) {
  return <div className="notice notice-error" role="alert"><strong>{message}</strong>{action && <span>{action}</span>}</div>;
}
export function WaitingForHost() { return <div className="video-message"><div className="pulse" /><h2>Waiting for Host…</h2><p>You’re connected. Video will appear automatically.</p></div>; }
export function SessionEnded({ removed = false }: { removed?: boolean }) {
  return <section className="center-card"><span className="eyebrow">{removed ? 'REMOVED' : 'SESSION ENDED'}</span><h1>{removed ? 'You were removed from this session.' : 'The Host has ended this session.'}</h1><p>You can now exit ViewCircle.</p><Link className="button button-primary" to="/">RETURN HOME</Link></section>;
}
