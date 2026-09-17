import { useEffect, useState } from 'react';
import { isIOSStandalone } from '../utilities/browser-environment';

function readEnvironment() {
  return isIOSStandalone(navigator, window.matchMedia?.('(display-mode: standalone)').matches ?? false);
}
export function useBrowserEnvironment() {
  const [iosStandalone, setIOSStandalone] = useState(readEnvironment);
  useEffect(() => {
    const display = window.matchMedia?.('(display-mode: standalone)');
    const update = () => setIOSStandalone(readEnvironment());
    display?.addEventListener('change', update);
    window.addEventListener('pageshow', update);
    return () => { display?.removeEventListener('change', update); window.removeEventListener('pageshow', update); };
  }, []);
  return { iosStandalone };
}
