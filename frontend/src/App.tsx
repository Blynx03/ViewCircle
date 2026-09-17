import { lazy, Suspense, useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccessGate } from './components/AccessGate';
import { OwnerPage } from './pages/OwnerPage';
import { LandingPage } from './pages/LandingPage';
import { SessionEnded } from './components/StatusViews';

const CreateHostPage = lazy(() => import('./pages/CreateHostPage').then((module) => ({ default: module.CreateHostPage })));
const HostRoomPage = lazy(() => import('./pages/HostRoomPage').then((module) => ({ default: module.HostRoomPage })));
const JoinPage = lazy(() => import('./pages/JoinPage').then((module) => ({ default: module.JoinPage })));
const WatchPage = lazy(() => import('./pages/WatchPage').then((module) => ({ default: module.WatchPage })));

export function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    document.dispatchEvent(new CustomEvent('viewcircle:manifest-route', { detail: pathname }));
  }, [pathname]);
  return <Suspense fallback={<main className="center-card"><p>Opening ViewCircle…</p></main>}><Routes>
    <Route path="/owner" element={<OwnerPage />} />
    <Route path="/" element={<LandingPage />} />
    <Route path="/host" element={<AccessGate><CreateHostPage /></AccessGate>} />
    <Route path="/host/:roomCode" element={<HostRoomPage />} />
    <Route path="/join" element={<JoinPage />} />
    <Route path="/join/:roomCode" element={<JoinPage />} />
    <Route path="/watch/:roomCode" element={<WatchPage />} />
    <Route path="/ended" element={<main className="ended-page"><SessionEnded /></main>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
