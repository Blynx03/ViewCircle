import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import { useOrientation } from '../hooks/useOrientation';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { supportsPictureInPicture, usePictureInPicture } from '../hooks/usePictureInPicture';

const mock = vi.hoisted(() => {
  const publication = { kind: 'video', isDesired: true, setSubscribed: vi.fn(function (this: { isDesired: boolean }, value: boolean) { this.isDesired = value; }) };
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const room = {
    state: 'connected', remoteParticipants: new Map([['host-test', { identity: 'host-test', videoTrackPublications: new Map([['video', publication]]) }]]),
    localParticipant: { identity: 'guest-test', trackPublications: new Map(), publishTrack: vi.fn(), setMicrophoneEnabled: vi.fn() },
    connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), startAudio: vi.fn(async () => {}),
    on: vi.fn(), removeAllListeners: vi.fn(),
  };
  room.on.mockImplementation((event: string, callback: (...args: unknown[]) => void) => { listeners.set(event, callback); return room; });
  return { room, publication, listeners, options: vi.fn() };
});
vi.mock('livekit-client', async (loadOriginal) => ({
  ...await loadOriginal<typeof import('livekit-client')>(),
  Room: class { constructor(options: unknown) { mock.options(options); return mock.room; } }
}));
const credentials = { identity: 'guest-test', token: 'test', livekitUrl: 'wss://example.test' };
function visibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mock.room.on.mockImplementation((event: string, callback: (...args: unknown[]) => void) => { mock.listeners.set(event, callback); return mock.room; });
  mock.publication.setSubscribed.mockImplementation(function (this: { isDesired: boolean }, value: boolean) { this.isDesired = value; });
  mock.room.startAudio.mockResolvedValue(undefined); mock.room.connect.mockResolvedValue(undefined); mock.room.disconnect.mockResolvedValue(undefined);
  mock.publication.isDesired = true; mock.room.state = 'connected';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
  Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: false });
});
afterEach(() => vi.restoreAllMocks());

describe('session orientation', () => {
  it('defaults to Portrait and preserves explicit selection across background, rotation and remount', async () => {
    const first = renderHook(() => useOrientation('portrait', 'session-one'));
    expect(first.result.current.orientation).toBe('portrait');
    await act(() => first.result.current.choose('landscape'));
    act(() => { visibility('hidden'); window.dispatchEvent(new Event('orientationchange')); visibility('visible'); });
    expect(first.result.current.orientation).toBe('landscape');
    expect(first.result.current.message).toBe('Rotate your device for the best view.');
    first.unmount();
    const second = renderHook(() => useOrientation('portrait', 'session-one'));
    expect(second.result.current.orientation).toBe('landscape');
    await act(() => second.result.current.choose('portrait'));
    expect(sessionStorage.getItem('session-one')).toBe('portrait');
    act(() => second.result.current.clear()); second.unmount();
    expect(sessionStorage.getItem('session-one')).toBeNull();
    const next = renderHook(() => useOrientation('portrait', 'session-two'));
    expect(next.result.current.orientation).toBe('portrait');
  });
  it('retains Landscape when an available orientation API rejects', async () => {
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock: vi.fn().mockRejectedValue(new Error('denied')) } });
    const hook = renderHook(() => useOrientation('portrait', 'reject'));
    await act(() => hook.result.current.choose('landscape'));
    expect(hook.result.current.orientation).toBe('landscape');
    expect(hook.result.current.message).toContain('Rotate');
  });
});

describe('room lifecycle', () => {
  it('only unsubscribes Host video in background, restores once, and releases the room on unmount', async () => {
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).toHaveBeenLastCalledWith(false);
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(mock.publication.setSubscribed).toHaveBeenCalledTimes(1);
    expect(mock.room.disconnect).not.toHaveBeenCalled();
    expect(mock.room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    act(() => { visibility('visible'); window.dispatchEvent(new Event('pageshow')); });
    expect(mock.publication.setSubscribed).toHaveBeenLastCalledWith(true);
    expect(mock.publication.setSubscribed).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(mock.room.disconnect).toHaveBeenCalledTimes(1);
    expect(mock.options).toHaveBeenCalledWith(expect.objectContaining({ disconnectOnPageLeave: false }));
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).toHaveBeenCalledTimes(2);
  });
  it('keeps receiving video while PiP is active and reconciles publications after reconnect', async () => {
    const hook = renderHook(() => useLiveRoom(credentials));
    const video = document.createElement('video');
    hook.result.current.videoRef.current = video;
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: video });
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
    act(() => mock.listeners.get(RoomEvent.Reconnected)?.());
    expect(mock.publication.setSubscribed).toHaveBeenLastCalledWith(false);
  });
  it('does not reconnect a removed Guest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { removed: true, status: 'LIVE' } })));
    const hook = renderHook(() => useLiveRoom(credentials, undefined, 'user', 'TEST'));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    mock.room.state = 'disconnected';
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    await waitFor(() => expect(hook.result.current.removed).toBe(true));
    expect(mock.room.connect).toHaveBeenCalledTimes(1);
  });
});

describe('PiP capability fallbacks', () => {
  it('hides unsupported PiP and detects Safari presentation support', () => {
    const video = document.createElement('video');
    expect(supportsPictureInPicture(video)).toBe(false);
    expect(supportsPictureInPicture(Object.assign(video, { webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: vi.fn() }))).toBe(true);
  });
  it('handles denied native PiP without ending the session', async () => {
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    const video = Object.assign(document.createElement('video'), { requestPictureInPicture: vi.fn().mockRejectedValue(new Error('denied')) });
    const hook = renderHook(() => usePictureInPicture({ current: video }, true));
    expect(hook.result.current.supported).toBe(true);
    await act(() => hook.result.current.toggle());
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.message).toContain('unavailable');
  });
});
