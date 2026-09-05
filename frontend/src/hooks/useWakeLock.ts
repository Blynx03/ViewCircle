import { useCallback, useEffect, useRef } from 'react';

interface WakeLockSentinelLike { release: () => Promise<void>; released: boolean }

export function useWakeLock(enabled: boolean) {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const acquire = useCallback(async () => {
    if (!enabled || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      const manager = navigator.wakeLock as { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      sentinel.current = await manager.request('screen');
    } catch { /* Wake lock is an enhancement and may be denied by battery policy. */ }
  }, [enabled]);
  useEffect(() => {
    void acquire();
    const visible = () => { if (!sentinel.current || sentinel.current.released) void acquire(); };
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); void sentinel.current?.release(); sentinel.current = null; };
  }, [acquire]);
}
