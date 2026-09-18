import { useEffect, useRef, useState } from 'react';
import { CameraZoomController, clampZoom, type ZoomRange } from '../utilities/camera-zoom';

export function HostCameraZoom({ getTrack }: { getTrack: () => MediaStreamTrack | null }) {
  const [range, setRange] = useState<ZoomRange | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [holding, setHolding] = useState(false);
  const [activity, setActivity] = useState(0);
  const [touch, setTouch] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const controller = useRef<CameraZoomController | null>(null);
  useEffect(() => {
    setRange(null);
    const zoom = new CameraZoomController(getTrack, setRange);
    controller.current = zoom; zoom.refresh();
    // LiveKit can replace the native track without replacing its wrapper (and
    // replaceTrack has no Restarted event). Read-only observation catches both.
    const timer = setInterval(zoom.refresh, 250);
    return () => { clearInterval(timer); zoom.dispose(); controller.current = null; };
  }, [getTrack]);
  useEffect(() => {
    const media = window.matchMedia?.('(any-pointer: coarse)');
    const update = () => setTouch(navigator.maxTouchPoints > 0 || Boolean(media?.matches));
    update(); media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!touch || !expanded || holding) return;
    const timer = setTimeout(() => {
      // Keep keyboard focus available on hybrid devices when the dial closes.
      if (container.current?.contains(document.activeElement)) pill.current?.focus({ preventScroll: true });
      setExpanded(false);
    }, 4500);
    return () => clearTimeout(timer);
  }, [touch, expanded, holding, activity]);
  useEffect(() => {
    if (!holding) return;
    const release = () => { setHolding(false); setActivity(value => value + 1); };
    window.addEventListener('keyup', release); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release);
    return () => { window.removeEventListener('keyup', release); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', release); };
  }, [holding]);
  if (!range) return null;
  const valueLabel = `${Number(range.value.toFixed(3))}×`;
  const open = !touch || expanded;
  return <div ref={container} className="host-camera-zoom" role="group" aria-label="Host camera zoom"
    onPointerDown={() => { setHolding(true); setActivity(value => value + 1); }}
    onFocus={() => setActivity(value => value + 1)}
    onKeyDown={event => {
      setActivity(value => value + 1);
      if (event.key !== 'Tab') setHolding(true);
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') controller.current?.set(range.min);
      else if (event.key === 'End') controller.current?.set(range.max);
      else controller.current?.step(event.key === 'ArrowRight' ? 1 : -1);
    }}>
    {open && <button type="button" aria-label="Zoom out" disabled={range.value <= range.min} onClick={() => { controller.current?.step(-1); setActivity(value => value + 1); }}>−</button>}
    {touch ? <button ref={pill} type="button" className="zoom-value" aria-label={`Camera zoom ${valueLabel}`} aria-expanded={expanded} onClick={() => { setExpanded(value => !value); setActivity(value => value + 1); }}>{valueLabel}</button>
      : <output className="zoom-value" aria-label="Current camera zoom">{valueLabel}</output>}
    {open && <><button type="button" aria-label="Zoom in" disabled={range.value >= clampZoom(range.max, range)} onClick={() => { controller.current?.step(1); setActivity(value => value + 1); }}>+</button>
      <input type="range" aria-label="Camera zoom" aria-valuetext={valueLabel} min={range.min} max={range.max} step={range.step} value={range.value}
        onChange={event => { controller.current?.set(Number(event.target.value)); setActivity(value => value + 1); }} /></>}
  </div>;
}
