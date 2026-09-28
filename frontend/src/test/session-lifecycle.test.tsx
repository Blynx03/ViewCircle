import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEvent, LocalAudioTrack } from 'livekit-client';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { supportsPictureInPicture, usePictureInPicture } from '../hooks/usePictureInPicture';

const mock = vi.hoisted(() => {
  const publication = { kind: 'video', isDesired: true, setSubscribed: vi.fn(function (this: { isDesired: boolean }, value: boolean) { this.isDesired = value; }) };
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const room = {
    state: 'connected', remoteParticipants: new Map([['host-test', { identity: 'host-test', videoTrackPublications: new Map([['video', publication]]) }]]),
    localParticipant: { identity: 'guest-test', isMicrophoneEnabled: false, trackPublications: new Map(), publishTrack: vi.fn(), setMicrophoneEnabled: vi.fn(), getTrackPublication: vi.fn() },
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
  mock.room.localParticipant.trackPublications.clear(); mock.room.localParticipant.isMicrophoneEnabled = false;
  mock.room.localParticipant.setMicrophoneEnabled.mockImplementation(async (enabled: boolean) => { mock.room.localParticipant.isMicrophoneEnabled = enabled; });
  mock.room.localParticipant.getTrackPublication.mockImplementation(() => mock.room.localParticipant.trackPublications.get('mic') as { track: LocalAudioTrack } | undefined);
  mock.publication.isDesired = true; mock.room.state = 'connected';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
  Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: false });
});
afterEach(() => vi.restoreAllMocks());

describe('room lifecycle', () => {
  it('preserves background subscriptions, resumes without rejoining, and releases on unmount', async () => {
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    expect(mock.room.disconnect).not.toHaveBeenCalled();
    expect(mock.room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    act(() => { visibility('visible'); window.dispatchEvent(new Event('pageshow')); });
    expect(mock.room.connect).toHaveBeenCalledTimes(1);
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    hook.unmount();
    expect(mock.room.disconnect).toHaveBeenCalledTimes(1);
    expect(mock.options).toHaveBeenCalledWith(expect.objectContaining({ disconnectOnPageLeave: false }));
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
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
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
  });
  it('automatically reconnects a real disconnect and does not reconnect just for visibility', async () => {
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    mock.room.state = 'disconnected';
    mock.room.connect.mockImplementation(async () => { mock.room.state = 'connected'; });
    await act(async () => { mock.listeners.get(RoomEvent.Disconnected)?.(); });
    expect(mock.room.connect).toHaveBeenCalledTimes(2);
    await act(async () => { visibility('hidden'); visibility('visible'); });
    expect(mock.room.connect).toHaveBeenCalledTimes(2);
    expect(mock.room.disconnect).not.toHaveBeenCalled();
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

describe('installed iOS Guest microphone preservation', () => {
  it('leaves normal Safari audio-session behavior unchanged', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    const audioSession = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession });
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    await act(() => hook.result.current.setMic(true));
    expect(audioSession.type).toBe('auto');
    act(() => visibility('hidden'));
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    hook.unmount();
    Reflect.deleteProperty(navigator, 'standalone'); Reflect.deleteProperty(navigator, 'audioSession');
  });
  it('does not change the audio session when microphone permission fails', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const audioSession = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession });
    mock.room.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error('denied'));
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    await act(async () => { await expect(hook.result.current.setMic(true)).rejects.toThrow('denied'); });
    expect(audioSession.type).toBe('auto');
    expect(mock.room.localParticipant.publishTrack).not.toHaveBeenCalled();
    hook.unmount();
    Reflect.deleteProperty(navigator, 'standalone'); Reflect.deleteProperty(navigator, 'audioSession');
  });

  it.each([
    [true, false, false], [true, true, false], [false, false, false], [false, true, false],
    [true, false, true], [true, true, true], [false, false, true], [false, true, true],
  ])('preserves installed=%s, intentional mute=%s, ended=%s through background/recovery', async (installed, muted, ended) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
    const audioSession = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession });
    const native = Object.assign(new EventTarget(), { readyState: 'live', muted: false });
    const restart = vi.fn(async () => { native.muted = false; native.readyState = 'live'; });
    const stop = vi.fn();
    const replace = vi.fn();
    const track = Object.create(LocalAudioTrack.prototype) as LocalAudioTrack;
    Object.defineProperties(track, { kind: { value: 'audio' }, isMuted: { value: muted, writable: true }, mediaStreamTrack: { get: () => native }, restartTrack: { value: restart }, stop: { value: stop }, replaceTrack: { value: replace } });
    const hook = renderHook(() => useLiveRoom(credentials));
    await waitFor(() => expect(hook.result.current.connection).toBe('connected'));
    mock.room.localParticipant.trackPublications.set('mic', { track });
    await act(() => hook.result.current.setMic(true));
    expect(replace).toHaveBeenCalledTimes(installed ? 1 : 0);
    expect(audioSession.type).toBe('auto');
    mock.room.localParticipant.trackPublications.set('mic', { track });
    act(() => mock.listeners.get(RoomEvent.LocalTrackPublished)?.({ track }));
    if (muted) await act(() => hook.result.current.setMic(false));
    mock.room.localParticipant.setMicrophoneEnabled.mockClear();
    act(() => { visibility('hidden'); window.dispatchEvent(new Event('pagehide')); });
    expect(mock.publication.setSubscribed).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled(); expect(restart).not.toHaveBeenCalled(); expect(mock.room.disconnect).not.toHaveBeenCalled();
    native.muted = true; native.readyState = ended ? 'ended' : 'live';
    act(() => { visibility('visible'); window.dispatchEvent(new Event('pageshow')); });
    await waitFor(() => expect(mock.room.startAudio).toHaveBeenCalled());
    expect(restart).toHaveBeenCalledTimes(!installed && !muted ? 1 : 0);
    expect(mock.room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(mock.room.localParticipant.publishTrack).not.toHaveBeenCalled();
    act(() => { visibility('hidden'); visibility('visible'); window.dispatchEvent(new Event('pageshow')); });
    await waitFor(() => expect(mock.room.startAudio).toHaveBeenCalledTimes(2));
    expect(restart).toHaveBeenCalledTimes(!installed && !muted ? 1 : 0);
    native.readyState = 'ended';
    await act(() => hook.result.current.setMic(true));
    expect(restart).toHaveBeenCalledTimes(installed || !muted ? 1 : 0);
    if (installed) expect(replace).toHaveBeenCalledWith(native, { userProvidedTrack: true });
    hook.unmount(); expect(stop).toHaveBeenCalledOnce(); expect(audioSession.type).toBe('auto');
    Reflect.deleteProperty(navigator, 'standalone'); Reflect.deleteProperty(navigator, 'audioSession');
  });
});
