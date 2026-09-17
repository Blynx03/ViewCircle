export type ControlIconName = 'mic' | 'sound' | 'camera' | 'flip' | 'share' | 'lock' | 'pip' | 'safari' | 'leave' | 'people';

export function ControlIcon({ name, off = false }: { name: ControlIconName; off?: boolean }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'mic' && <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>}
    {name === 'sound' && <><path d="m11 4-6 5H2v6h3l6 5V4Z" />{!off && <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</>}
    {name === 'camera' && <><rect x="2" y="5" width="14" height="14" rx="3" /><path d="m16 9 6-3v12l-6-3" /></>}
    {name === 'flip' && <><path d="M3 8a9 9 0 0 1 16-3l2 3M21 16A9 9 0 0 1 5 19l-2-3M21 3v5h-5M3 21v-5h5" /></>}
    {name === 'share' && <><path d="M12 16V2m-5 5 5-5 5 5M5 12H3v9h18v-9h-2" /></>}
    {name === 'lock' && <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3" /></>}
    {name === 'pip'  && <><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="11" width="7" height="6" rx="1" /><path d="m5 7 4 3m-3 0h3V7" /></>}
    {name === 'safari' && <><circle cx="12" cy="12" r="10" /><path d="m16 8-3 5-5 3 3-5 5-3Z" /></>}
    {name === 'leave' && <path d="M9 3H4v18h5m0-9h12m-4-4 4 4-4 4" />}
    {name === 'people' && <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2m0-16a3 3 0 0 1 0 6m3 4a5 5 0 0 1 3 5" /></>}
    {off && <path d="m2 2 20 20" strokeWidth="2.4" />}
  </svg>;
}
