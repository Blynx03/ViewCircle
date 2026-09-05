import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../config/brand';

export function AppLayout({ children }: PropsWithChildren) {
  return <main className="app-shell">
    <header className="topbar"><Link to="/" className="brand">{BRAND.appName}</Link></header>
    {children}
  </main>;
}
