import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { accessApi } from '../api/access';
vi.mock('../api/access', () => ({ accessApi: { status: vi.fn(), ask: vi.fn() } }));
const unauthorized = { authorized: false, owner: false, request: null };
function Location() { const { pathname } = useLocation(); return <output aria-label="Current route">{pathname}</output>; }
function open(path = '/') { return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(accessApi.status).mockResolvedValue(unauthorized); });
afterEach(() => vi.useRealTimers());
describe('Host-only demo approval', () => {
  it('opens the public role choice and Guest flow without checking demo access', async () => {
    open();
    expect(screen.getByRole('link', { name: /HOST/ })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: /GUEST/ }));
    expect(await screen.findByLabelText('Room Code')).toBeVisible();
    expect(accessApi.status).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Request Access' })).not.toBeInTheDocument();
  });
  it('allows direct Guest Join navigation without approval', async () => {
    open('/join');
    expect(await screen.findByLabelText('Room Code')).toBeVisible();
    expect(accessApi.status).not.toHaveBeenCalled();
  });
  it('intercepts unauthorized Host selection at the Host route', async () => {
    open(); fireEvent.click(screen.getByRole('link', { name: /HOST/ }));
    expect(await screen.findByRole('button', { name: 'Request Access' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/host');
    expect(screen.queryByRole('heading', { name: 'Create your circle' })).not.toBeInTheDocument();
  });
  it('protects direct Create Room navigation', async () => {
    open('/host');
    expect(await screen.findByRole('button', { name: 'Request Access' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'CREATE SESSION' })).not.toBeInTheDocument();
  });
  it('lets an already-approved Host go directly to Create Room', async () => {
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, authorized: true, expiresAt: Date.now() + 60000 });
    open(); fireEvent.click(screen.getByRole('link', { name: /HOST/ }));
    expect(await screen.findByRole('heading', { name: 'Create your circle' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Request Access' })).not.toBeInTheDocument();
  });
  it('automatically reveals Create Room after approval while retaining Host intent', async () => {
    vi.useFakeTimers();
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, request: { id: 'one', status: 'pending', expiresAt: Date.now() + 60000 } });
    open('/host'); await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Waiting for owner approval…')).toBeVisible();
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, authorized: true, expiresAt: Date.now() + 60000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole('heading', { name: 'Create your circle' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/host');
  });
  it('keeps denied Hosts out of Create Room', async () => {
    vi.mocked(accessApi.status).mockResolvedValue({ ...unauthorized, request: { id: 'one', status: 'denied', expiresAt: Date.now() + 60000 } });
    open('/host'); expect(await screen.findByText('Access was not approved.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Create your circle' })).not.toBeInTheDocument();
  });
  it('keeps Owner login separate from public Guest access', async () => {
    open('/owner'); expect(await screen.findByRole('button', { name: 'Owner Login' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Access Requests' })).not.toBeInTheDocument();
  });
});
