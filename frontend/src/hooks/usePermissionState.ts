import { useCallback, useEffect, useState } from 'react';
import type { MediaPermissionKind } from '../components/PermissionHelp';

export type MediaPermissionState = PermissionState | 'unavailable';

export function usePermissionState(kind: MediaPermissionKind) {
  const [state, setState] = useState<MediaPermissionState>('unavailable');
  const check = useCallback(async () => {
    if (!navigator.permissions?.query) { setState('unavailable'); return; }
    try {
      const status = await navigator.permissions.query({ name: kind });
      setState(status.state);
    } catch { setState('unavailable'); }
  }, [kind]);
  useEffect(() => { void check(); }, [check]);
  return { state, check, setState };
}
