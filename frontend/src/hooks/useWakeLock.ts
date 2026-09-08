import { useEffect } from 'react';

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || pending || !enabled || document.visibilityState !== 'visible' || !('wakeLock' in navigator) || (sentinel && !sentinel.released)) return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed) await next.release(); else sentinel = next;
      } catch { /* Battery policy can deny this enhancement. */ }
      finally { pending = false; }
    };
    const visible = () => { void acquire(); };
    visible(); document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; document.removeEventListener('visibilitychange', visible); void sentinel?.release().catch(() => {}); };
  }, [enabled]);
}
