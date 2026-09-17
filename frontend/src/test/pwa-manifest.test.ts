// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
interface Manifest { name: string; id?: string; start_url: string; scope: string; icons: { src: string }[]; theme_color: string; background_color: string }
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const main = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8')) as Manifest;
const owner = JSON.parse(readFileSync(new URL('../../public/owner-manifest.webmanifest', import.meta.url), 'utf8')) as Manifest;
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
function select(pathname: string) {
  let href: string | null = null;
  const title = { content: 'ViewCircle' };
  let route!: (event: { detail: string }) => void;
  runInNewContext(script, { window: { location: { pathname } }, document: {
    getElementById: (id: string) => id === 'app-install-title' ? title : { getAttribute: () => href, setAttribute: (_key: string, value: string) => { href = value; } },
    addEventListener: (_name: string, callback: typeof route) => { route = callback; }
  } });
  return { href: () => href, title, navigate: (detail: string) => route({ detail }) };
}
describe('separate Owner installation', () => {
  it('preserves the main start URL and gives Owner a distinct identity and launch URL', () => {
    expect(main.name).toBe('ViewCircle'); expect(main.start_url).toBe('/');
    expect(owner).toMatchObject({ name: 'ViewCircle Owner', short_name: 'ViewCircle Owner', id: '/owner', start_url: '/owner', scope: '/', display: 'standalone' });
    expect(owner.id).not.toBe(main.id ?? main.start_url);
    expect(owner.icons).toEqual(main.icons);
    expect(owner.theme_color).toBe(main.theme_color); expect(owner.background_color).toBe(main.background_color);
  });
  it('selects synchronously before React without an initial wrong manifest href', () => {
    expect(html).toContain('<link rel="manifest" id="app-manifest" />');
    expect(html.indexOf(script)).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(html.match(/rel="manifest"/g)).toHaveLength(1);
  });
  it.each(['/owner', '/owner/', '/OWNER'])('%s cold launch selects Owner immediately', path => {
    const page = select(path); expect(page.href()).toBe('/owner-manifest.webmanifest'); expect(page.title.content).toBe('ViewCircle Owner');
  });
  it.each(['/', '/host', '/host/ABCD', '/join/ABCD', '/watch/ABCD', '/owner-other'])('%s keeps the normal manifest', path => {
    expect(select(path).href()).toBe('/manifest.webmanifest');
  });
  it('switches both ways on SPA route changes without duplicate links', () => {
    const page = select('/'); page.navigate('/owner'); expect(page.href()).toBe('/owner-manifest.webmanifest');
    page.navigate('/join/ABCD'); expect(page.href()).toBe('/manifest.webmanifest'); expect(page.title.content).toBe('ViewCircle');
  });
  it('uses origin-relative launch, identity, scope and icon URLs', () => {
    for (const manifest of [main, owner]) for (const path of [manifest.id ?? manifest.start_url, manifest.start_url, manifest.scope, ...manifest.icons.map((icon: { src: string }) => icon.src)]) {
      expect(path).toMatch(/^\/(?!\/)/); expect(path).not.toContain('?');
    }
  });
});
