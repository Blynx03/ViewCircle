import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostCameraZoom } from '../components/HostCameraZoom';
import { CameraZoomController, clampZoom, readCameraZoom } from '../utilities/camera-zoom';

function camera(min = 1, max = 4, step = .1, deviceId = 'rear') {
  let value = min;
  const track = {
    readyState: 'live', enabled: true,
    getCapabilities: vi.fn(() => ({ zoom: { min, max, step } })),
    getSettings: vi.fn(() => ({ zoom: value, deviceId })),
    getConstraints: vi.fn(() => ({ width: 1280, frameRate: 24, advanced: [{ torch: true, zoom: 1 }] })),
    applyConstraints: vi.fn(async (constraints: MediaTrackConstraints) => {
      value = (constraints.advanced?.at(-1) as { zoom: number }).zoom;
    }),
    stop: vi.fn(),
  };
  return { track, native: track as unknown as MediaStreamTrack };
}
const flush = async (time = 125) => { await act(async () => { await vi.advanceTimersByTimeAsync(time); }); };
beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('native published-camera zoom', () => {
  it('reads actual nonstandard min, max, step and current setting', () => {
    const { native } = camera(.5, 3.5, .25);
    expect(readCameraZoom(native)).toEqual({ min: .5, max: 3.5, step: .25, value: .5 });
  });
  it('hides absent, fixed, invalid, ended, and unreadable capabilities', () => {
    expect(readCameraZoom(null)).toBeNull();
    expect(readCameraZoom(camera(1, 1).native)).toBeNull();
    expect(readCameraZoom(camera(1, 4, -1).native)).toBeNull();
    const { native, track } = camera();
    track.getCapabilities.mockImplementation(() => { throw new Error('Unsupported'); });
    expect(readCameraZoom(native)).toBeNull();
    expect(readCameraZoom({ readyState: 'ended' } as MediaStreamTrack)).toBeNull();
    expect(readCameraZoom({ readyState: 'live', enabled: true, applyConstraints: vi.fn(), getSettings: () => ({}) } as unknown as MediaStreamTrack)).toBeNull();
  });
  it('clamps and snaps relative to the camera minimum without exceeding max', () => {
    const range = { min: .5, max: 2.6, step: .25, value: 1 };
    expect(clampZoom(-100, range)).toBe(.5);
    expect(clampZoom(100, range)).toBe(2.5);
    expect(clampZoom(1.13, range)).toBe(1.25);
  });
  it('applies zoom to the supplied outgoing track and retains other constraints', async () => {
    const { native, track } = camera(); const update = vi.fn();
    const control = new CameraZoomController(() => native, update);
    control.refresh(); control.set(2); await flush();
    expect(track.applyConstraints).toHaveBeenCalledWith({ width: 1280, frameRate: 24, advanced: [{ torch: true }, { zoom: 2 }] });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ value: 2 }));
    expect(track.stop).not.toHaveBeenCalled(); control.dispose();
  });
  it('coalesces rapid changes to at most eight requests per second', async () => {
    const { native, track } = camera(); const control = new CameraZoomController(() => native, vi.fn());
    control.set(1.1); await flush(0);
    for (let i = 0; i < 100; i++) control.set(1 + i / 100);
    await flush(124); expect(track.applyConstraints).toHaveBeenCalledTimes(1);
    await flush(1); expect(track.applyConstraints).toHaveBeenCalledTimes(2);
    expect(track.getSettings().zoom).toBe(2); control.dispose();
  });
  it('serializes slow requests and displays only confirmed settings', async () => {
    const { native, track } = camera(); const update = vi.fn();
    let finish = () => {};
    const apply = track.applyConstraints.getMockImplementation()!;
    track.applyConstraints.mockImplementationOnce(async constraints => { await new Promise<void>(resolve => { finish = resolve; }); await apply(constraints); });
    const control = new CameraZoomController(() => native, update);
    control.set(2); await flush(0); control.set(3); await flush(1000);
    expect(track.applyConstraints).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    finish(); await flush(0); expect(track.applyConstraints).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ value: 3 }));
    control.dispose();
  });
  it('constraint rejection hides zoom without stopping video or retrying', async () => {
    const { native, track } = camera(); const update = vi.fn();
    track.applyConstraints.mockRejectedValue(new Error('OverconstrainedError'));
    const control = new CameraZoomController(() => native, update);
    control.set(2); await flush(); control.refresh(); control.set(3); await flush(1000);
    expect(update).toHaveBeenLastCalledWith(null);
    expect(track.applyConstraints).toHaveBeenCalledTimes(1); expect(track.stop).not.toHaveBeenCalled(); control.dispose();
  });
  it('hides controls if a browser silently ignores an advanced constraint', async () => {
    const { native, track } = camera(); const update = vi.fn(); track.applyConstraints.mockResolvedValue(undefined);
    const control = new CameraZoomController(() => native, update);
    control.set(2); await flush(); expect(update).toHaveBeenLastCalledWith(null); control.dispose();
  });
  it('refreshes front/rear range and preserves normalized intent using valid steps', async () => {
    const rear = camera(1, 5, .25, 'rear'); const front = camera(.5, 2.5, .5, 'front');
    let current = rear.native; const update = vi.fn(); const control = new CameraZoomController(() => current, update);
    control.set(3); await flush(); current = front.native; control.refresh();
    expect(update).toHaveBeenLastCalledWith({ min: .5, max: 2.5, step: .5, value: .5 });
    await flush(); expect(front.track.getSettings().zoom).toBe(1.5);
    expect(front.track.applyConstraints).toHaveBeenCalledTimes(1); control.dispose();
  });
  it('reads actual state after same-camera restart without pretending the old zoom survived', async () => {
    const old = camera(); const restarted = camera(); let current = old.native;
    const update = vi.fn(); const control = new CameraZoomController(() => current, update);
    control.set(3); await flush(); current = restarted.native; control.refresh(); await flush();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    expect(restarted.track.applyConstraints).not.toHaveBeenCalled(); control.dispose();
  });
  it('drops queued work when the track changes or controller unmounts', async () => {
    const first = camera(); const second = camera(); let current = first.native;
    const control = new CameraZoomController(() => current, vi.fn());
    control.set(3); current = second.native; control.refresh(); await flush();
    expect(first.track.applyConstraints).not.toHaveBeenCalled(); expect(second.track.applyConstraints).not.toHaveBeenCalled();
    control.set(2); control.dispose(); await flush(); expect(second.track.applyConstraints).not.toHaveBeenCalled();
  });
  it('ignores stale async completion after a different camera replaces the track', async () => {
    const first = camera(); const second = camera(.5, 2, .1, 'front'); let current = first.native;
    let reject: (error: Error) => void = () => {}; first.track.applyConstraints.mockImplementation(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
    const update = vi.fn(); const control = new CameraZoomController(() => current, update);
    control.set(2); await flush(0); current = second.native; control.refresh(); reject(new Error('Old camera ended')); await flush();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ min: .5, max: 2 }));
    expect(second.track.stop).not.toHaveBeenCalled(); control.dispose();
  });
});

describe('Host zoom interaction', () => {
  it('supports mouse +/- and focused arrows/Home/End but never global arrows', async () => {
    const { native, track } = camera(); const view = render(<HostCameraZoom getTrack={() => native} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await flush(); expect(track.applyConstraints).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); await flush(); expect(track.getSettings().zoom).toBe(1.1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' })); await flush(); expect(track.getSettings().zoom).toBe(1);
    const slider = screen.getByRole('slider'); slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' }); await flush(); expect(track.getSettings().zoom).toBe(1.1);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' }); await flush(); expect(track.getSettings().zoom).toBe(1);
    fireEvent.keyDown(slider, { key: 'End' }); await flush(); expect(track.getSettings().zoom).toBe(4);
    fireEvent.keyDown(slider, { key: 'Home' }); await flush(); expect(track.getSettings().zoom).toBe(1); view.unmount();
  });
  it('supports touch/hybrid dial regardless of viewport width, and pauses collapse while dragging', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    const { native, track } = camera(.5, 2.5, .25); const view = render(<HostCameraZoom getTrack={() => native} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Camera zoom 0.5×' }));
    const slider = screen.getByRole('slider'); expect(slider).toHaveAttribute('min', '0.5'); expect(slider).toHaveAttribute('max', '2.5');
    fireEvent.pointerDown(slider); fireEvent.change(slider, { target: { value: '1.5' } }); await flush();
    expect(track.getSettings().zoom).toBe(1.5); expect(screen.getByRole('button', { name: 'Camera zoom 1.5×' })).toBeVisible();
    await flush(5000); expect(slider).toBeVisible(); fireEvent.pointerUp(window); await flush(4500);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument(); view.unmount();
  });
  it('hides unsupported and muted cameras, rechecks native-track replacements, and cleans timers', async () => {
    const first = camera(); const second = camera(.5, 2, .1, 'front'); let current: MediaStreamTrack | null = null;
    const view = render(<HostCameraZoom getTrack={() => current} />);
    expect(screen.queryByRole('group')).not.toBeInTheDocument(); current = first.native; await flush(250);
    expect(screen.getByRole('slider')).toHaveAttribute('max', '4'); current = second.native; await flush(250);
    expect(screen.getByRole('slider')).toHaveAttribute('min', '0.5'); second.track.enabled = false; await flush(250);
    expect(screen.queryByRole('group')).not.toBeInTheDocument(); view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
it('appears after publication and delayed camera settings become available', async () => {
  const { native, track } = camera(); let current: MediaStreamTrack | null = null;
  const settings = track.getSettings.getMockImplementation()!;
  track.getSettings.mockReturnValue({ deviceId:'rear' } as ReturnType<typeof settings>);
  const view = render(<HostCameraZoom getTrack={() => current} />);
  current = native; await flush(250); expect(screen.queryByRole('group')).not.toBeInTheDocument();
  track.getSettings.mockImplementation(settings); await flush(250);
  expect(screen.getByRole('group', { name:'Host camera zoom' })).toBeVisible();
  view.unmount();
});
