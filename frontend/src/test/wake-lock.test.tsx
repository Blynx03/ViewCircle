import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWakeLock } from '../hooks/useWakeLock';
afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(navigator, 'wakeLock'); });
it('requests for broadcasting, reacquires after OS release/visibility return and releases on end', async () => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const sentinels: Array<EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> }> = [];
  const request = vi.fn(async () => {
    const sentinel = Object.assign(new EventTarget(), { released: false, release: vi.fn(async () => {}) });
    sentinels.push(sentinel); return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  const hook = renderHook(({ enabled }) => useWakeLock(enabled), { initialProps: { enabled: true } });
  await act(async () => {}); expect(request).toHaveBeenCalledWith('screen');
  act(() => { sentinels[0]!.released = true; sentinels[0]!.dispatchEvent(new Event('release')); });
  await act(() => vi.advanceTimersByTimeAsync(1000)); expect(request).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => { sentinels[1]!.released = true; sentinels[1]!.dispatchEvent(new Event('release')); });
  await act(() => vi.advanceTimersByTimeAsync(2000)); expect(request).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(request).toHaveBeenCalledTimes(3);
  hook.rerender({ enabled: false }); expect(sentinels[2]!.release).toHaveBeenCalledOnce();
});
it('safely handles unsupported and denied APIs', async () => {
  const hook = renderHook(() => useWakeLock(true)); hook.unmount();
  const request = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  renderHook(() => useWakeLock(true)); await act(async () => {}); expect(request).toHaveBeenCalledOnce();
});
it('releases a pending request that resolves after session end', async () => {
  let resolve!: (value: unknown) => void;
  const release = vi.fn(async () => {});
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => new Promise(r => { resolve = r; }) } });
  const hook = renderHook(() => useWakeLock(true)); hook.unmount();
  await act(async () => resolve({ release })); expect(release).toHaveBeenCalledOnce();
});
