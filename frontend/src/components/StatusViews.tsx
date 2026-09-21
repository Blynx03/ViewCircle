import { Link } from 'react-router-dom';

export function FriendlyError({ message, action }: { message: string; action?: string }) {
  return <div className="notice notice-error" role="alert"><strong>{message}</strong>{action && <span>{action}</span>}</div>;
}
export function WaitingForHost() { return <div className="video-message"><div className="pulse" /><h2>Host video is temporarily unavailable</h2><p>Video will return when the Host’s camera is available.</p></div>; }
export function SessionEnded({ removed = false }: { removed?: boolean }) {
  return <section className="center-card"><span className="eyebrow">{removed ? 'REMOVED' : 'SESSION ENDED'}</span><h1>{removed ? 'You were removed from this session.' : 'This session has ended.'}</h1><p>You can now exit ViewCircle.</p><Link className="button button-primary" to="/">RETURN HOME</Link></section>;
}
