import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { GuestVideoViewport } from '../components/GuestVideoViewport';
import { GuestControls } from '../components/GuestControls';
import { bindGuestVideoZoom, clampGuestZoom } from '../utilities/guest-video-zoom';

function dimensions(stage: HTMLElement, video: HTMLVideoElement, width = 400, height = 300, nativeWidth = 400, nativeHeight = 300) {
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width, height } as DOMRect);
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: nativeWidth });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: nativeHeight });
  fireEvent(video, new Event('loadedmetadata'));
}
function pointer(stage: HTMLElement, type: string, id: number, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' }, clientX: { value: x }, clientY: { value: y } });
  fireEvent(stage, event);
}
function pinch(stage: HTMLElement, width = 200) {
  pointer(stage, 'pointerdown', 1, 150, 150); pointer(stage, 'pointerdown', 2, 250, 150);
  pointer(stage, 'pointermove', 1, 200 - width / 2, 150); pointer(stage, 'pointermove', 2, 200 + width / 2, 150);
}
function finish(stage: HTMLElement) { pointer(stage, 'pointerup', 1, 100, 150); pointer(stage, 'pointerup', 2, 300, 150); }
function setup() {
  const stage = document.createElement('section'); const video = document.createElement('video'); const indicator = document.createElement('output');
  stage.append(video, indicator); document.body.append(stage); dimensions(stage, video);
  const active = vi.fn(); const tap = vi.fn(); stage.addEventListener('click', tap);
  const dispose = bindGuestVideoZoom(stage, video, indicator, active);
  return { stage, video, indicator, active, tap, dispose: () => { dispose(); stage.remove(); } };
}
const frame = () => act(() => { vi.advanceTimersByTime(20); });
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Guest-local pinch and pan', () => {
  it('pinches out/in, clamps at 1–3, and resets pan at 1', () => {
    const test = setup(); pinch(test.stage); frame(); expect(test.video.style.transform).toContain('scale(2)');
    pointer(test.stage, 'pointermove', 1, -200, 150); pointer(test.stage, 'pointermove', 2, 600, 150); frame();
    expect(test.video.style.transform).toContain('scale(3)');
    pointer(test.stage, 'pointermove', 1, 180, 150); pointer(test.stage, 'pointermove', 2, 220, 150); frame();
    expect(test.video.style.transform).toBe(''); finish(test.stage); test.dispose();
  });
  it('pans with one finger after pinch and clamps both edges to the viewport', () => {
    const test = setup(); pinch(test.stage); finish(test.stage);
    pointer(test.stage, 'pointerdown', 3, 200, 150); pointer(test.stage, 'pointermove', 3, 1000, 1000); frame();
    expect(test.video.style.transform).toBe('translate(200px, 150px) scale(2)');
    pointer(test.stage, 'pointermove', 3, -1000, -1000); frame(); expect(test.video.style.transform).toBe('translate(-200px, -150px) scale(2)');
    fireEvent.click(test.stage); expect(test.tap).not.toHaveBeenCalled(); test.dispose();
  });
  it('accounts for object-fit letterboxing, portrait/landscape, and Host dimension changes', () => {
    const test = setup(); dimensions(test.stage, test.video, 400, 800, 1600, 900); pinch(test.stage);
    pointer(test.stage, 'pointerup', 2, 300, 150); pointer(test.stage, 'pointermove', 1, 1000, 1000); frame();
    expect(test.video.style.transform).toBe('translate(200px, 0px) scale(2)');
    dimensions(test.stage, test.video, 800, 400, 900, 1600); fireEvent(window, new Event('orientationchange')); frame();
    expect(test.video.style.transform).toBe('translate(0px, 0px) scale(2)'); test.dispose();
  });
  it('does not interpret pinch or drag-at-1x as a tap; fresh simple tap works', () => {
    const test = setup(); pinch(test.stage); finish(test.stage); fireEvent.click(test.stage);
    expect(test.tap).not.toHaveBeenCalled();
    pointer(test.stage, 'pointerdown', 4, 100, 100); pointer(test.stage, 'pointerup', 4, 100, 100); fireEvent.click(test.stage);
    expect(test.tap).toHaveBeenCalledTimes(1); test.dispose();
    const next = setup(); pointer(next.stage, 'pointerdown', 1, 100, 100); pointer(next.stage, 'pointermove', 1, 150, 100);
    pointer(next.stage, 'pointerup', 1, 150, 100); fireEvent.click(next.stage); expect(next.tap).not.toHaveBeenCalled(); next.dispose();
  });
  it('shows a temporary indicator through a held gesture and fades after release', () => {
    const test = setup(); pinch(test.stage); frame(); expect(test.indicator.textContent).toBe('2.0×');
    expect(test.indicator).toHaveClass('is-visible'); act(() => { vi.advanceTimersByTime(5000); }); expect(test.indicator).toHaveClass('is-visible');
    finish(test.stage); act(() => { vi.advanceTimersByTime(1200); }); expect(test.indicator).not.toHaveClass('is-visible'); test.dispose();
  });
  it('releases the dock pause on pointer cancellation or focus loss', () => {
    const test = setup(); pinch(test.stage); expect(test.active).toHaveBeenLastCalledWith(true);
    pointer(test.stage, 'pointercancel', 1, 150, 150); pointer(test.stage, 'lostpointercapture', 2, 250, 150);
    expect(test.active).toHaveBeenLastCalledWith(false);
    pinch(test.stage); fireEvent(window, new Event('blur')); expect(test.active).toHaveBeenLastCalledWith(false); test.dispose();
  });
  it('does not hijack audio buttons or change another Guest video or any media APIs', () => {
    const a = setup(); const b = setup(); const marker = { getTracks: vi.fn(), applyConstraints: vi.fn() };
    Object.defineProperty(a.video, 'srcObject', { configurable: true, value: marker });
    const button = document.createElement('button'); a.stage.append(button); const action = vi.fn(); button.addEventListener('click', action);
    pinch(a.stage); finish(a.stage); frame(); fireEvent.click(button); expect(action).toHaveBeenCalledOnce();
    expect(b.video.style.transform).toBe(''); expect(a.video.srcObject).toBe(marker);
    expect(marker.getTracks).not.toHaveBeenCalled(); expect(marker.applyConstraints).not.toHaveBeenCalled(); a.dispose(); b.dispose();
  });
  it('resets a cleared video and removes transforms, listeners, and timers on disposal', () => {
    const test = setup(); pinch(test.stage); frame(); fireEvent(test.video, new Event('emptied')); frame(); expect(test.video.style.transform).toBe('');
    pinch(test.stage); frame(); test.dispose(); expect(test.video.style.transform).toBe(''); expect(vi.getTimerCount()).toBe(0);
    pinch(test.stage); frame(); expect(test.video.style.transform).toBe('');
  });
  it('clamps bounds without exposing extra empty space', () => {
    expect(clampGuestZoom({ scale: 2, x: 900, y: 900 }, { width: 400, height: 800, contentWidth: 400, contentHeight: 225 })).toEqual({ scale: 2, x: 200, y: 0 });
    expect(clampGuestZoom({ scale: .5, x: 99, y: 99 }, { width: 400, height: 300, contentWidth: 400, contentHeight: 300 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

const noop = () => {};
function Guest({ sessionKey = 'A' }: { sessionKey?: string }) {
  const [restore, setRestore] = useState(0); const [active, setActive] = useState(false);
  return <><GuestVideoViewport sessionKey={sessionKey} onTap={() => setRestore(value => value + 1)} onInteraction={setActive}><video className="host-video" /></GuestVideoViewport>
    <GuestControls restoreSignal={restore} panelOpen={active} micOn={false} micBusy={false} soundOn iosStandalone={false} pipSupported={false} pipActive={false} hasVideo
      onMic={noop} onSound={noop} onPip={noop} onSafari={noop} onPeople={noop} onLeave={noop} /></>;
}
it('pauses visible dock auto-hide during gestures, leaves hidden dock hidden, and restores only on tap', () => {
  const view = render(<Guest />); const stage = view.container.querySelector('section')!; const video = view.container.querySelector('video')!; dimensions(stage, video);
  const dock = screen.getByRole('navigation');
  act(() => { vi.advanceTimersByTime(4000); }); pinch(stage); act(() => { vi.advanceTimersByTime(5000); }); expect(dock).toHaveAttribute('aria-hidden', 'false');
  finish(stage); act(() => { vi.advanceTimersByTime(4499); }); expect(dock).toHaveAttribute('aria-hidden', 'false');
  act(() => { vi.advanceTimersByTime(1); }); expect(dock).toHaveAttribute('aria-hidden', 'true');
  pinch(stage); finish(stage); fireEvent.click(stage); expect(dock).toHaveAttribute('aria-hidden', 'true');
  pointer(stage, 'pointerdown', 5, 200, 150); pointer(stage, 'pointerup', 5, 200, 150); fireEvent.click(video);
  expect(dock).toHaveAttribute('aria-hidden', 'false'); view.unmount();
});
it('resets local transforms when session identity changes or the viewport unmounts', () => {
  const view = render(<Guest sessionKey="A" />); const stage = view.container.querySelector('section')!; const video = view.container.querySelector('video')!; dimensions(stage, video);
  pinch(stage); frame(); expect(video.style.transform).toContain('scale(2)');
  view.rerender(<Guest sessionKey="B" />); frame(); expect(video.style.transform).toBe('');
  pinch(stage); frame(); view.unmount(); expect(video.style.transform).toBe('');
});
