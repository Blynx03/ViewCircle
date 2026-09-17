import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { HostRoomPage } from '../pages/HostRoomPage';
import { WatchPage } from '../pages/WatchPage';
import { SessionEnded } from '../components/StatusViews';

const mock = vi.hoisted(() => ({ stop: vi.fn(), attach: vi.fn(), detach: vi.fn(), iosStandalone: false }));
vi.mock('livekit-client', async load => ({ ...await load<typeof import('livekit-client')>(), createLocalVideoTrack: vi.fn(async () => mock) }));
vi.mock('../hooks/useLiveRoom', () => ({ useLiveRoom: () => ({
  participants: [], videoRef: { current: null }, audioContainerRef: { current: null }, hasVideo: true,
  connection: 'connected', soundOn: true, sessionEnded: false, removed: false,
}) }));
vi.mock('../hooks/usePictureInPicture', () => ({ usePictureInPicture: () => ({ supported: false }) }));
vi.mock('../hooks/useBrowserEnvironment', () => ({ useBrowserEnvironment: () => ({ iosStandalone: mock.iosStandalone }) }));
vi.mock('../hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));

beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); mock.iosStandalone = false;
  vi.spyOn(api, 'getSession').mockResolvedValue({ roomCode: 'TEST', locked: false } as Awaited<ReturnType<typeof api.getSession>>);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function route(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/host/:roomCode" element={<HostRoomPage />} />
    <Route path="/watch/:roomCode" element={<WatchPage />} />
    <Route path="/ended" element={<SessionEnded />} />
    <Route path="/" element={<h1>Host / Guest</h1>} />
  </Routes></MemoryRouter>);
}
it('Guest Leave calls the existing leave endpoint, clears credentials, and returns home', async () => {
  const leave = vi.spyOn(api, 'leave').mockResolvedValue({});
  sessionStorage.setItem('vc_guest_TEST', JSON.stringify({ identity: 'guest-test', token: 'test', livekitUrl: 'wss://example.test' }));
  route('/watch/TEST');
  await userEvent.click(screen.getByRole('button', { name: 'Leave session' }));
  expect(leave).toHaveBeenCalledWith('TEST', 'guest-test', 'test');
  expect(sessionStorage.getItem('vc_guest_TEST')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Host / Guest' })).toBeVisible();
});
it('Host End keeps confirmation, ends through the existing API, then returns home from Session Ended', async () => {
  vi.spyOn(api, 'hostToken').mockResolvedValue({ identity: 'host-test', token: 'test', livekitUrl: 'wss://example.test' });
  const end = vi.spyOn(api, 'end').mockResolvedValue({});
  route('/host/TEST');
  await userEvent.click(await screen.findByRole('button', { name: 'ENABLE CAMERA' }));
  await userEvent.click(screen.getByRole('button', { name: 'START SESSION' }));
  const controls = await screen.findByRole('navigation', { name: 'Host controls' });
  expect(within(controls).queryByRole('button', { name: /rotate|fullscreen|full screen/i })).not.toBeInTheDocument();
  for (const button of within(controls).getAllByRole('button')) expect(button.querySelector('svg')).not.toBeNull();
  await userEvent.click(within(controls).getByRole('button', { name: 'End Session' }));
  expect(end).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'END SESSION' }));
  await waitFor(() => expect(end).toHaveBeenCalledWith('TEST'));
  expect(await screen.findByText('The Host has ended this session.')).toBeVisible();
  expect(mock.stop).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('link', { name: 'RETURN HOME' }));
  expect(screen.getByRole('heading', { name: 'Host / Guest' })).toBeVisible();
});
it('sends the Guest credential only in the Leave authorization header', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} }), { headers: { 'Content-Type': 'application/json' } }));
  await api.leave('TEST', 'guest-test', 'guest-credential');
  expect(fetch).toHaveBeenCalledWith('/api/sessions/TEST/leave', expect.objectContaining({
    method: 'POST', keepalive: true, credentials: 'include', body: JSON.stringify({ identity: 'guest-test' }),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer guest-credential', 'X-ViewCircle-Request': '1' },
  }));
});

it('keeps the dock visible throughout Safari guidance, then hides and restores on a real video tap', async () => {
  vi.useFakeTimers(); mock.iosStandalone = true;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  sessionStorage.setItem('vc_guest_TEST', JSON.stringify({ identity: 'guest-test', token: 'test', livekitUrl: 'wss://example.test' }));
  const view = route('/watch/TEST');
  const dock = screen.getByRole('navigation', { name: 'Guest controls' });
  act(() => { vi.advanceTimersByTime(4000); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue while using other apps' })); });
  act(() => { vi.advanceTimersByTime(10000); });
  expect(screen.getByRole('dialog')).toBeVisible(); expect(dock).toHaveAttribute('aria-hidden', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Close Safari instructions' }));
  act(() => { vi.advanceTimersByTime(4499); }); expect(dock).toHaveAttribute('aria-hidden', 'false');
  act(() => { vi.advanceTimersByTime(1); }); expect(dock).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(view.container.querySelector('video')!); expect(dock).toHaveAttribute('aria-hidden', 'false');
  view.unmount();
});
