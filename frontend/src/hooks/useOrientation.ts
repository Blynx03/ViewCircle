import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrientationPreference } from '../types/session';

interface OrientationApi { lock?: (orientation: string) => Promise<void>; unlock?: () => void }

export function useOrientation(initial: OrientationPreference = 'portrait', sessionKey?: string) {
  const [orientation, setOrientation] = useState<OrientationPreference>(() => {
    try { return sessionKey && sessionStorage.getItem(sessionKey) === 'landscape' ? 'landscape' : initial; } catch { return initial; }
  });
  const cleared = useRef(false);
  const [message, setMessage] = useState('');
  const choose = useCallback(async (next: OrientationPreference) => {
    cleared.current = false; setOrientation(next); setMessage('');
    try { if (sessionKey) sessionStorage.setItem(sessionKey, next); } catch { /* In-memory preference still works. */ }
    const api = screen.orientation as (ScreenOrientation & OrientationApi) | undefined;
    try {
      if (!api?.lock) throw new Error('unsupported');
      if (next === 'landscape' && !document.fullscreenElement && document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      await api.lock(next === 'portrait' ? 'portrait-primary' : 'landscape-primary');
    } catch { setMessage(next === 'landscape' ? 'Rotate your device for the best view.' : 'Rotate your device to portrait.'); }
  }, [sessionKey]);
  const release = useCallback(() => { const api = screen.orientation as (ScreenOrientation & OrientationApi) | undefined; try { api?.unlock?.(); } catch { /* Best effort. */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }, []);
  useEffect(() => {
    const restore = () => { if (!cleared.current && document.visibilityState === 'visible') void choose(orientation); };
    document.addEventListener('visibilitychange', restore); window.addEventListener('pageshow', restore);
    return () => { document.removeEventListener('visibilitychange', restore); window.removeEventListener('pageshow', restore); };
  }, [choose, orientation]);
  const clear = useCallback(() => { cleared.current = true; try { if (sessionKey) sessionStorage.removeItem(sessionKey); } catch { /* Storage may be blocked. */ } release(); }, [release, sessionKey]);
  return { clear, orientation, choose, release, message };
}
