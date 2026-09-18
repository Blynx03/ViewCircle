export interface LocalZoom { scale: number; x: number; y: number }
interface Point { x: number; y: number }
interface Viewport { width: number; height: number; contentWidth: number; contentHeight: number }
const centered: LocalZoom = { scale: 1, x: 0, y: 0 };
const limit = (value: number, max: number) => Math.max(-max, Math.min(max, value));

export function clampGuestZoom(zoom: LocalZoom, view: Viewport): LocalZoom {
  const scale = Math.max(1, Math.min(3, zoom.scale));
  if (scale === 1) return { ...centered };
  return {
    scale,
    x: limit(zoom.x, Math.max(0, (view.contentWidth * scale - view.width) / 2)),
    y: limit(zoom.y, Math.max(0, (view.contentHeight * scale - view.height) / 2)),
  };
}

/** Local presentation only: no media-track, LiveKit, permission, or network APIs. */
export function bindGuestVideoZoom(surface: HTMLElement, video: HTMLVideoElement, indicator: HTMLElement, activity: (active: boolean) => void) {
  const points = new Map<number, Point>();
  let zoom = { ...centered };
  let view: Viewport = { width: 0, height: 0, contentWidth: 0, contentHeight: 0 };
  let rect = surface.getBoundingClientRect();
  let seed: { zoom: LocalZoom; center: Point; distance: number } | null = null;
  let gesture = false;
  let suppressClick = false;
  let frame = 0;
  let indicatorTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,a,input,select,textarea,[role="button"]'));
  const pair = () => {
    const [first, second] = [...points.values()];
    if (!first) return null;
    return { center: second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0 };
  };
  const rebase = () => { const current = pair(); seed = current ? { ...current, zoom: { ...zoom } } : null; };
  const paint = () => {
    frame = 0;
    video.style.transform = zoom.scale === 1 ? '' : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    indicator.textContent = `${zoom.scale.toFixed(1)}×`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const showIndicator = () => {
    clearTimeout(indicatorTimer);
    indicator.classList.add('is-visible');
  };
  const fadeIndicator = () => {
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => indicator.classList.remove('is-visible'), 1200);
  };
  const measure = () => {
    if (disposed) return;
    const previous = rect;
    rect = surface.getBoundingClientRect();
    // Keep contact coordinates relative to the new center during rotation or
    // dynamic viewport changes; do not carry an old-origin drag into it.
    for (const [id, point] of points) points.set(id, {
      x: point.x + previous.left + previous.width / 2 - rect.left - rect.width / 2,
      y: point.y + previous.top + previous.height / 2 - rect.top - rect.height / 2,
    });
    const fit = video.videoWidth && video.videoHeight ? Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight) : 0;
    view = { width: rect.width, height: rect.height, contentWidth: fit * video.videoWidth, contentHeight: fit * video.videoHeight };
    zoom = fit ? clampGuestZoom(zoom, view) : { ...centered };
    rebase(); schedule();
  };
  const releaseAll = () => {
    const ids = [...points.keys()]; points.clear(); seed = null;
    for (const id of ids) { try { if (surface.hasPointerCapture?.(id)) surface.releasePointerCapture(id); } catch { /* Browser already canceled capture. */ } }
    activity(false); fadeIndicator();
  };
  const reset = () => { releaseAll(); zoom = { ...centered }; suppressClick = true; indicator.classList.remove('is-visible'); schedule(); };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || interactive(event.target) || !video.videoWidth || !video.videoHeight) return;
    if (!points.size) { measure(); gesture = false; suppressClick = false; activity(true); }
    points.set(event.pointerId, { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    try { surface.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events / canceled contact. */ }
    if (points.size > 1) { gesture = true; suppressClick = true; showIndicator(); }
    rebase();
  };
  const move = (event: PointerEvent) => {
    if (!points.has(event.pointerId) || !seed) return;
    points.set(event.pointerId, { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    const current = pair(); if (!current) return;
    const dx = current.center.x - seed.center.x; const dy = current.center.y - seed.center.y;
    if (points.size > 1) {
      const scale = Math.max(1, Math.min(3, seed.zoom.scale * current.distance / Math.max(seed.distance, 1)));
      const ratio = scale / seed.zoom.scale;
      zoom = clampGuestZoom({ scale, x: current.center.x - (seed.center.x - seed.zoom.x) * ratio, y: current.center.y - (seed.center.y - seed.zoom.y) * ratio }, view);
      gesture = true;
    } else if (Math.hypot(dx, dy) > 6 || gesture) {
      gesture = true;
      zoom = clampGuestZoom({ ...seed.zoom, x: seed.zoom.x + dx, y: seed.zoom.y + dy }, view);
    }
    if (gesture) {
      suppressClick = true;
      if (event.cancelable) event.preventDefault();
      showIndicator(); schedule();
    }
  };
  const up = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    points.delete(event.pointerId);
    if (event.type !== 'pointerup') suppressClick = true;
    try { if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    rebase();
    if (!points.size) { activity(false); fadeIndicator(); }
  };
  const click = (event: MouseEvent) => {
    if (interactive(event.target)) return;
    // Suppress all synthesized clicks from a multi-contact gesture. A fresh
    // touch-down or genuine mouse-down starts a new tap, clearing this flag.
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const mouse = (event: PointerEvent) => { if (event.pointerType === 'mouse') suppressClick = false; };
  const cancel = () => { if (points.size) { suppressClick = true; releaseAll(); } };
  const visibility = () => { if (document.hidden) cancel(); };
  const preventGesture = (event: Event) => { if (!interactive(event.target) && event.cancelable) event.preventDefault(); };
  surface.addEventListener('pointerdown', down); surface.addEventListener('pointerdown', mouse);
  surface.addEventListener('pointermove', move, { passive: false });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) surface.addEventListener(name, up);
  surface.addEventListener('click', click, true);
  // Safari's legacy gesture events are scoped to this surface, never document.
  for (const name of ['gesturestart', 'gesturechange', 'dragstart']) surface.addEventListener(name, preventGesture, { passive: false });
  for (const name of ['loadedmetadata', 'resize']) video.addEventListener(name, measure);
  video.addEventListener('emptied', reset);
  window.addEventListener('resize', measure); window.addEventListener('orientationchange', measure); window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  observer?.observe(surface); measure();
  return () => {
    disposed = true; releaseAll(); clearTimeout(indicatorTimer); cancelAnimationFrame(frame); observer?.disconnect();
    video.style.transform = ''; indicator.classList.remove('is-visible');
    surface.removeEventListener('pointerdown', down); surface.removeEventListener('pointerdown', mouse); surface.removeEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) surface.removeEventListener(name, up);
    surface.removeEventListener('click', click, true);
    for (const name of ['gesturestart', 'gesturechange', 'dragstart']) surface.removeEventListener(name, preventGesture);
    for (const name of ['loadedmetadata', 'resize']) video.removeEventListener(name, measure);
    video.removeEventListener('emptied', reset);
    window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', visibility);
  };
}
