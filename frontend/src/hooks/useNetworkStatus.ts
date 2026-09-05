import { useEffect, useState } from 'react';
export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const yes = () => setOnline(true); const no = () => setOnline(false);
    window.addEventListener('online', yes); window.addEventListener('offline', no);
    return () => { window.removeEventListener('online', yes); window.removeEventListener('offline', no); };
  }, []);
  return online;
}
