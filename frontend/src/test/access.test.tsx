import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { accessApi } from '../api/access';
import { AccessGate } from '../components/AccessGate';
import { OwnerPage } from '../pages/OwnerPage';
vi.mock('../api/access', () => ({ accessApi: { status: vi.fn(), ask: vi.fn(), list: vi.fn(), login: vi.fn(), logout: vi.fn(), decide: vi.fn(), pushKey: vi.fn(), subscribe: vi.fn() } }));
const unauthorized = { authorized: false, owner: false, request: null };
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(accessApi.status).mockResolvedValue(unauthorized);
  vi.mocked(accessApi.list).mockResolvedValue([]); vi.mocked(accessApi.pushKey).mockResolvedValue({ publicKey: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Portfolio gate', () => {
  it('hides protected content and asks for name without an account', async () => {
    render(<AccessGate><p>Protected room</p></AccessGate>);
    expect(await screen.findByRole('button', { name: 'Request Access' })).toBeVisible();
    expect(screen.getByLabelText('Your Name')).toBeRequired();
    expect(screen.queryByText('Protected room')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    vi.mocked(accessApi.ask).mockResolvedValue({ id: 'one', status: 'pending' });
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, request: { id: 'one', status: 'pending', expiresAt: Date.now() + 60000 } });
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));
    expect(await screen.findByText('Waiting for owner approval…')).toBeVisible();
    expect(accessApi.ask).toHaveBeenCalledWith('John', '');
  });
  it('polls pending requests, transitions automatically, and cleans up polling', async () => {
    vi.useFakeTimers();
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, request: { id: 'one', status: 'pending', expiresAt: Date.now() + 60000 } });
    const view = render(<MemoryRouter initialEntries={['/join/ABCD']}><AccessGate><p>Intended room ABCD</p></AccessGate></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Waiting for owner approval…')).toBeVisible();
    vi.mocked(accessApi.status).mockResolvedValue({ authorized: true, owner: false, request: null, expiresAt: Date.now() + 60000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('Intended room ABCD')).toBeVisible();
    view.unmount(); const calls = vi.mocked(accessApi.status).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(accessApi.status).toHaveBeenCalledTimes(calls);
  });
  it('unmounts protected content at expiry even if the status network request stalls', async () => {
    vi.useFakeTimers();
    vi.mocked(accessApi.status).mockResolvedValueOnce({ ...unauthorized, authorized: true, expiresAt: Date.now() + 60001 }).mockImplementation(() => new Promise(() => undefined));
    render(<AccessGate><p>Protected room</p></AccessGate>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Protected room')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(60002); });
    expect(screen.queryByText('Protected room')).not.toBeInTheDocument();
  });
  it.each(['denied', 'expired'])('shows %s requests with a request-again form', async status => {
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, request: { id: 'one', status, expiresAt: Date.now() } });
    render(<AccessGate><p>Protected</p></AccessGate>);
    expect(await screen.findByRole('button', { name: 'Request Access' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(status === 'denied' ? 'Access was not approved.' : 'Your access has expired.');
  });
});
describe('Owner UI', () => {
  it('submits Remember Me, opens dashboard, and logs out', async () => {
    vi.mocked(accessApi.login).mockResolvedValue({}); vi.mocked(accessApi.logout).mockResolvedValue({});
    render(<MemoryRouter><OwnerPage /></MemoryRouter>);
    const login = await screen.findByRole('button', { name: 'Owner Login' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' })); fireEvent.click(login);
    expect(await screen.findByRole('heading', { name: 'Access Requests' })).toBeVisible();
    expect(accessApi.login).toHaveBeenCalledWith('owner', 'test-password', true);
    expect(await screen.findByText('Notifications unavailable on this device/browser')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByRole('button', { name: 'Owner Login' })).toBeVisible();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
  it.each(['Approve', 'Deny'])('lets Owner %s a pending request', async action => {
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, authorized: true, owner: true });
    vi.mocked(accessApi.list).mockResolvedValue([{ id: 'one', name: 'John', status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 60000 }]);
    vi.mocked(accessApi.decide).mockResolvedValue({});
    render(<MemoryRouter><OwnerPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: action }));
    await waitFor(() => expect(accessApi.decide).toHaveBeenCalledWith('one', action.toLowerCase()));
  });
});

describe('Owner notification permission', () => {
  it('requests permission only after a tap and registers the subscription', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('PushManager', class {});
    const subscription = { endpoint: 'https://web.push.apple.com/test', toJSON: () => ({}) } as unknown as PushSubscription;
    const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) } };
    const previous = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(async () => registration), register: vi.fn(async () => registration), ready: Promise.resolve(registration) } });
    try {
      vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, owner: true, authorized: true });
      vi.mocked(accessApi.pushKey).mockResolvedValue({ publicKey: btoa('test-key') });
      vi.mocked(accessApi.subscribe).mockResolvedValue({});
      render(<MemoryRouter><OwnerPage /></MemoryRouter>);
      const button = await screen.findByRole('button', { name: 'Enable Access Notifications' });
      await waitFor(() => expect(button).toBeEnabled());
      expect(requestPermission).not.toHaveBeenCalled();
      fireEvent.click(button);
      expect(await screen.findByText('Notifications enabled')).toBeVisible();
      expect(requestPermission).toHaveBeenCalledOnce(); expect(accessApi.subscribe).toHaveBeenCalledWith(subscription);
    } finally { if (previous) Object.defineProperty(navigator, 'serviceWorker', previous); else Reflect.deleteProperty(navigator, 'serviceWorker'); }
  });
  it('does not nag when notification permission is denied', async () => {
    const requestPermission = vi.fn(); vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, owner: true, authorized: true });
    vi.mocked(accessApi.pushKey).mockResolvedValue({ publicKey: 'public-key' });
    render(<MemoryRouter><OwnerPage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Enable Access Notifications' })).toBeDisabled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

it('notification context highlights a request but never authorizes or auto-submits a decision', async () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, owner: true, authorized: true });
  vi.mocked(accessApi.list).mockResolvedValue([{ id, name: 'John', status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 60000 }]);
  vi.mocked(accessApi.decide).mockResolvedValue({});
  render(<MemoryRouter initialEntries={[`/owner#request=${id}&intent=approve`]}><OwnerPage /></MemoryRouter>);
  expect(await screen.findByText('From notification — review approve')).toBeVisible();
  expect(accessApi.decide).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(accessApi.decide).toHaveBeenCalledWith(id, 'approve'));
});
