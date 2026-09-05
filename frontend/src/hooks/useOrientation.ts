import { useCallback, useState } from 'react';
import type { OrientationPreference } from '../types/session';

interface OrientationApi { lock?: (orientation: string) => Promise<void>; unlock?: () => void }

export function useOrientation(initial: OrientationPreference = 'portrait') {
  const [orientation, setOrientation] = useState(initial);
  const [message, setMessage] = useState('');
  const choose = useCallback(async (next: OrientationPreference) => {
    setOrientation(next); setMessage('');
    const api = screen.orientation as (ScreenOrientation & OrientationApi) | undefined;
    try {
      if (!api?.lock) throw new Error('unsupported');
      await api.lock(next === 'portrait' ? 'portrait-primary' : 'landscape-primary');
    } catch { setMessage(`Rotate your device to ${next}.`); }
  }, []);
  const release = useCallback(() => { const api = screen.orientation as (ScreenOrientation & OrientationApi) | undefined; api?.unlock?.(); }, []);
  return { orientation, choose, release, message };
}
