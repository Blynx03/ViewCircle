import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostRoomPage } from '../pages/HostRoomPage';

vi.mock('livekit-client', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('livekit-client')>();
  return { ...original, createLocalVideoTrack: vi.fn(), createLocalAudioTrack: vi.fn() };
});

const restartTrack = vi.fn();
const videoTrack = {
  attach: vi.fn(), detach: vi.fn(), stop: vi.fn(), restartTrack, kind: 'video', mediaStreamTrack: { getSettings: vi.fn(() => ({ facingMode: 'user' })) }
} as unknown as LocalVideoTrack;
const audioTrack = { stop: vi.fn(), kind: 'audio' } as unknown as LocalAudioTrack;

describe('Host media setup', () => {
  beforeEach(() => {
    vi.mocked(createLocalVideoTrack).mockResolvedValue(videoTrack);
    vi.mocked(createLocalAudioTrack).mockResolvedValue(audioTrack);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'front' }, { kind: 'videoinput', deviceId: 'rear' }
    ]) } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: {
      roomCode: '7K4P', hostName: 'Host', pinRequired: false, status: 'CREATED', locked: false, guestCount: 0, capacity: 10
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('waits for explicit actions, reports readiness, and offers camera choice after permission', async () => {
    render(<MemoryRouter initialEntries={['/host/7K4P']}><Routes><Route path="/host/:roomCode" element={<HostRoomPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Set up your camera and mic' })).toBeVisible();
    expect(createLocalVideoTrack).not.toHaveBeenCalled(); expect(createLocalAudioTrack).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ENABLE CAMERA' }));
    expect(await screen.findByText('Camera Ready ✓')).toBeVisible();
    expect(screen.getByText('Which camera do you want to use?')).toBeVisible();
    expect(createLocalVideoTrack).toHaveBeenCalledWith(expect.objectContaining({ facingMode: 'user' }));

    await userEvent.click(screen.getByRole('button', { name: 'REAR CAMERA' }));
    expect(restartTrack).toHaveBeenCalledWith({ facingMode: 'environment' });
    await userEvent.click(screen.getByRole('button', { name: 'ENABLE MICROPHONE' }));
    await waitFor(() => expect(screen.getByText('Microphone Ready ✓')).toBeVisible());
    expect(createLocalAudioTrack).toHaveBeenCalledWith(expect.objectContaining({ echoCancellation: true, noiseSuppression: true }));
  });
});
