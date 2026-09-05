import { useCallback, useEffect, useState } from 'react';

export function useFullscreen() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggle = useCallback(async () => {
    setMessage('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error('unsupported');
    } catch { setMessage('Full screen is not available in this browser.'); }
  }, []);
  return { active, toggle, message };
}
