import { useEffect, useRef, type PropsWithChildren } from 'react';

/** Safari can pan/resize the visual viewport independently of the layout
 * viewport during keyboard and browser-toolbar transitions. Anchor the entire
 * live surface, not individual overlays, to those bounds at normal page zoom.
 */
export function LiveViewport({ className, children }: PropsWithChildren<{ className: string }>) {
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const element = surface.current; if (!element) return;
      // During rotation a resize event can expose the previous visual bounds.
      // Let CSS follow layout immediately rather than pinning old pixel sizes.
      const normalScale = viewport && Math.abs(viewport.scale - 1) < .01 && viewport.width <= window.innerWidth + 1 && viewport.height <= window.innerHeight + 1;
      const values = normalScale ? [viewport.offsetLeft, viewport.offsetTop, viewport.width === window.innerWidth ? undefined : viewport.width, viewport.height === window.innerHeight ? undefined : viewport.height] : null;
      ['left', 'top', 'width', 'height'].forEach((key, index) => {
        const value = values?.[index];
        if (value !== undefined) element.style.setProperty(`--live-${key}`, `${value}px`);
        else element.style.removeProperty(`--live-${key}`);
      });
    };
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <main ref={surface} className={className}>{children}</main>;
}
