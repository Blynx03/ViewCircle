import { useEffect } from 'react';

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let sentinel: WakeLockSentinel | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!disposed && enabled && document.visibilityState === 'visible') retry = setTimeout(() => { void acquire(); }, 1000);
    };
    const acquire = async () => {
      if (disposed || pending || !enabled || document.visibilityState !== 'visible' || !navigator.wakeLock?.request || (sentinel && !sentinel.released)) return;
      clearTimeout(retry);
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed) await next.release();
        else {
          sentinel = next;
          next.addEventListener('release', schedule, { once: true });
        }
      } catch { /* Battery/browser policy may deny wake lock. Retry on visibility return. */ }
      finally { pending = false; }
    };
    const visible = () => { void acquire(); };
    visible(); document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', visible);
    return () => {
      disposed = true; clearTimeout(retry);
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', visible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
