import { useEffect, useRef, type ReactNode } from 'react';
import { bindGuestVideoZoom } from '../utilities/guest-video-zoom';

/** Keeps the existing stage and LiveKit-owned video element in place. */
export function GuestVideoViewport({ sessionKey, onTap, onInteraction, children }: {
  sessionKey: string; onTap: () => void; onInteraction: (active: boolean) => void; children: ReactNode;
}) {
  const surface = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLOutputElement>(null);
  const activity = useRef(onInteraction);
  useEffect(() => { activity.current = onInteraction; }, [onInteraction]);
  useEffect(() => {
    const stage = surface.current; const video = stage?.querySelector('video'); const label = indicator.current;
    if (!stage || !video || !label) return;
    return bindGuestVideoZoom(stage, video, label, active => activity.current(active));
  }, [sessionKey]);
  return <section ref={surface} className="video-stage guest-video-viewport" onClick={onTap}>
    {children}<output ref={indicator} className="guest-zoom-indicator" aria-label="Local video zoom" aria-live="off">1.0×</output>
  </section>;
}
