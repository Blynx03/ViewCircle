import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { GuestRejoin } from '../components/GuestRejoin';
const context = { roomCode: 'ABCD', name: 'Remembered Guest', identity: 'guest-same', expiresAt: Date.now() + 120000 };
const credentials = { identity: context.identity, token: 'guest-only', livekitUrl: 'wss://media.test' };
beforeEach(() => { sessionStorage.clear(); vi.spyOn(api, 'guestRecovery').mockResolvedValue(context); vi.spyOn(api, 'rejoinGuest').mockResolvedValue({ ...context, credentials }); vi.spyOn(api, 'dismissGuestRecovery').mockResolvedValue({}); });
afterEach(() => vi.restoreAllMocks());
function show() { render(<MemoryRouter><Routes><Route path="/" element={<GuestRejoin />} /><Route path="/watch/ABCD" element={<p>Restored viewer</p>} /></Routes></MemoryRouter>); }
it('shows no prompt until the backend confirms eligibility, then rejoins without typing or admission', async () => {
  let resolve!: (value: typeof context) => void;
  vi.mocked(api.guestRecovery).mockReturnValue(new Promise(r => { resolve = r; }));
  const admission = vi.spyOn(api, 'requestJoin'); show(); expect(screen.queryByText('Rejoin session?')).not.toBeInTheDocument();
  await act(async () => resolve(context));
  await userEvent.click(screen.getByRole('button', { name: 'Rejoin Session' }));
  expect(screen.getByText('Restored viewer')).toBeVisible();
  expect(JSON.parse(sessionStorage.getItem('vc_guest_ABCD')!)).toEqual(credentials); expect(admission).not.toHaveBeenCalled();
  expect(api.rejoinGuest).toHaveBeenCalledOnce();
});
it.each(['ended', 'expired', 'owner-ended', 'host-ended', 'grace-expired'])('does not show backend-rejected %s recovery', async () => {
  vi.mocked(api.guestRecovery).mockResolvedValue(null); show();
  await waitFor(() => expect(api.guestRecovery).toHaveBeenCalledOnce()); expect(screen.queryByText('Rejoin session?')).not.toBeInTheDocument();
});
it('Not Now clears server recovery state and removes the card', async () => {
  show(); await userEvent.click(await screen.findByRole('button', { name: 'Not Now' }));
  expect(api.dismissGuestRecovery).toHaveBeenCalledOnce(); expect(screen.queryByText('Rejoin session?')).not.toBeInTheDocument();
});
it('handles a session ending between validation and click without navigating', async () => {
  vi.mocked(api.rejoinGuest).mockResolvedValue(null); show();
  await userEvent.click(await screen.findByRole('button', { name: 'Rejoin Session' }));
  expect(screen.queryByText('Restored viewer')).not.toBeInTheDocument(); expect(sessionStorage.length).toBe(0);
});
