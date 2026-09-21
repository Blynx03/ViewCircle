import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../api/client';
import { JoinPage } from '../pages/JoinPage';
import { CreateHostPage } from '../pages/CreateHostPage';
import { SessionLifecycle } from '../components/SessionLifecycle';
import { LandingPage } from '../pages/LandingPage';
import { OwnerPage } from '../pages/OwnerPage';
import { accessApi } from '../api/access';
import type { PublicSession } from '../types/session';
vi.mock('../api/client', () => ({ api: { available: vi.fn(), getSession: vi.fn(), join: vi.fn(), active: vi.fn(), recover: vi.fn(), createSession: vi.fn(), requests: vi.fn(), decide: vi.fn(), keepWaiting: vi.fn(), end: vi.fn(), requestJoin: vi.fn(), requestStatus: vi.fn() }, request: vi.fn() }));
vi.mock('../api/access', () => ({ accessApi: { status: vi.fn(), login: vi.fn() } }));
const base: PublicSession = { roomCode: 'AB7K', hostName: 'Host', status: 'LIVE', locked: false, pinRequired: false, guestCount: 0, capacity: 10, visibility: 'private', createdAt: new Date().toISOString(), expiresAt: Date.now() + 10_800_000 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.available).mockResolvedValue([]); vi.mocked(api.requests).mockResolvedValue([]); vi.mocked(api.getSession).mockResolvedValue({ ...base }); vi.mocked(api.active).mockResolvedValue(null); window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); window.history.replaceState({}, '', '/'); });
it('uses the Private invitation query credential while preserving the display-name requirement', async () => {
  window.history.replaceState({}, '', '/join?room=AB7K');
  vi.mocked(api.join).mockResolvedValue({ token: 'guest-token', identity: 'guest-a', livekitUrl: 'wss://example.test' });
  render(<MemoryRouter initialEntries={['/join']}><Routes><Route path="/join" element={<JoinPage />} /><Route path="/watch/:code" element={<p>Watching</p>} /></Routes></MemoryRouter>);
  expect(screen.getByLabelText('Room Code')).toHaveValue('AB7K'); expect(screen.getByRole('button', { name: 'JOIN SESSION' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Guest' } }); fireEvent.click(screen.getByRole('button', { name: 'JOIN SESSION' }));
  expect(await screen.findByText('Watching')).toBeVisible(); expect(api.join).toHaveBeenCalledWith('AB7K', { name: 'Guest' });
});
it('explains expired invitation links', async () => {
  window.history.replaceState({}, '', '/join?room=AB7K'); vi.mocked(api.getSession).mockResolvedValue({ ...base, status: 'ENDED' });
  render(<MemoryRouter><JoinPage /></MemoryRouter>); expect(await screen.findByText(/This invitation has expired/)).toBeVisible();
});
it('shows recovery before creation and preserves the existing room on Rejoin', async () => {
  vi.mocked(api.active).mockResolvedValue(base); vi.mocked(api.recover).mockResolvedValue(base);
  render(<MemoryRouter><CreateHostPage /></MemoryRouter>); expect(await screen.findByText('You already have an active session.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Rejoin Session' })); await waitFor(() => expect(api.recover).toHaveBeenCalledOnce()); expect(api.createSession).not.toHaveBeenCalled();
});
it('warns at five minutes and shows the final waiting countdown', async () => {
  vi.useFakeTimers(); const now = Date.now(); vi.mocked(api.getSession).mockResolvedValue({ ...base, createdAt: new Date(now - 300_000).toISOString(), everJoined: false });
  render(<SessionLifecycle code="AB7K" host />); await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('No guests have joined yet. Do you want to keep waiting?')).toBeVisible(); expect(screen.getByText('Session ending in 0:30')).toBeVisible();
  vi.mocked(api.keepWaiting).mockResolvedValue({ ...base, createdAt: new Date(now - 300_000).toISOString(), keepWaiting: true });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keep Waiting' }))); expect(api.keepWaiting).toHaveBeenCalledWith('AB7K');
});
it('dismisses the Host-alone notice without canceling the server timer', async () => {
  vi.mocked(api.getSession).mockResolvedValue({ ...base, everJoined: true, aloneSince: Date.now() - 100_000 });
  render(<SessionLifecycle code="AB7K" host />); fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText(/All guests have left/)).not.toBeInTheDocument(); expect(screen.getByText(/Session ending in/)).toBeVisible(); expect(api.end).not.toHaveBeenCalled();
});
it('shows camera recovery with an explicit retry action and no camera-free mode', async () => {
  const retry = vi.fn(); vi.mocked(api.getSession).mockResolvedValue({ ...base, everJoined: true, cameraMissingSince: Date.now() });
  render(<SessionLifecycle code="AB7K" host retryCamera={retry} />); fireEvent.click(await screen.findByRole('button', { name: 'Try Camera Again' })); expect(retry).toHaveBeenCalledOnce(); expect(screen.queryByText(/Continue Without Camera/i)).not.toBeInTheDocument();
});
it('sends only the currently displayed request IDs for Allow All Waiting', async () => {
  vi.mocked(api.requests).mockResolvedValue([{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }]);
  render(<SessionLifecycle code="AB7K" host />); fireEvent.click(await screen.findByRole('button', { name: 'Allow All Waiting' }));
  await waitFor(() => expect(api.decide).toHaveBeenCalledWith('AB7K', ['one', 'two'], true));
});
it('supports Owner password autofill and accessible visibility without changing the password', async () => {
  vi.mocked(accessApi.status).mockResolvedValue({ owner: false, authorized: false, request: null });
  render(<MemoryRouter><OwnerPage /></MemoryRouter>); const password = await screen.findByLabelText('Password');
  expect(password).toHaveAttribute('type', 'password'); expect(password).toHaveAttribute('autocomplete', 'current-password'); expect(password).toHaveAttribute('name', 'password');
  expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
  fireEvent.change(password, { target: { value: 'test-secret' } }); fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text'); expect(password).toHaveValue('test-secret'); fireEvent.click(screen.getByRole('button', { name: 'Hide password' })); expect(password).toHaveAttribute('type', 'password');
});

it('offers active-session recovery when an authorized Host reopens the landing page', async () => {
  vi.mocked(api.active).mockResolvedValue(base); vi.mocked(api.recover).mockResolvedValue(base);
  render(<MemoryRouter><LandingPage /></MemoryRouter>);
  expect(await screen.findByText('You already have an active session.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Rejoin Session' }));
  await waitFor(() => expect(api.recover).toHaveBeenCalledOnce()); expect(api.createSession).not.toHaveBeenCalled();
});
