import { useEffect, useRef, useState } from 'react';

export function PortraitTip({ sessionKey, hasVideo }: { sessionKey: string; hasVideo: boolean }) {
  const [visible, setVisible] = useState(false);
  const displayed = useRef<{ key: string; until: number } | null>(null);
  useEffect(() => {
    if (!hasVideo) return;
    const media = window.matchMedia?.('(orientation: portrait) and (pointer: coarse)');
    if (!media) return;
    const key = `vc_portrait_tip_${sessionKey}`;
    let shown = false; let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      if (!media.matches) { if (displayed.current?.key === key) displayed.current.until = 0; setVisible(false); return; }
      if (shown) return;
      if (displayed.current?.key !== key) {
        try { if (sessionStorage.getItem(key)) return; } catch { /* In-memory fallback. */ }
        displayed.current = { key, until: Date.now() + 6000 };
      }
      const remaining = displayed.current.until - Date.now();
      if (remaining <= 0) return;
      shown = true; setVisible(true);
      try { sessionStorage.setItem(key, 'shown'); } catch { /* Storage optional. */ }
      timer = setTimeout(() => setVisible(false), remaining);
    };
    update(); media.addEventListener('change', update);
    return () => { clearTimeout(timer); media.removeEventListener('change', update); setVisible(false); };
  }, [sessionKey, hasVideo]);
  return visible ? <p className="portrait-tip">Rotate your device for a wider view.</p> : null;
}
