import { Link } from 'react-router-dom';
import { BRAND } from '../config/brand';

export function LandingPage() {
  return <main className="landing">
    <div className="landing-glow" />
    <section className="landing-content">
      <div className="logo-mark" aria-hidden="true"><span /></div>
      <h1>{BRAND.appName}</h1><p className="tagline">{BRAND.tagline}</p>
      <nav className="role-actions" aria-label="Choose how to join">
        <Link className="role-card host-card" to="/host"><span className="role-icon">●</span><strong>HOST</strong><small>Share your camera</small></Link>
        <Link className="role-card" to="/join"><span className="role-icon">◉</span><strong>GUEST</strong><small>Watch and talk</small></Link>
      </nav>
    </section>
    <footer><strong>{BRAND.projectName}</strong><span>by {BRAND.creator}</span></footer>
  </main>;
}
