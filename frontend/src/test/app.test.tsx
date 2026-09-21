import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LandingPage } from '../pages/LandingPage';
import { CreateHostPage } from '../pages/CreateHostPage';
import { JoinPage } from '../pages/JoinPage';
import { SessionEnded } from '../components/StatusViews';
import { ControlButton } from '../components/SessionControls';
import { PermissionHelp } from '../components/PermissionHelp';
import { normalizeRoomCode } from '../utilities/room-code';

describe('ViewCircle UI', () => {
  it('shows the minimal Host and Guest landing choices', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'ViewCircle' })).toBeVisible();
    expect(screen.getByRole('link', { name: /HOST/ })).toHaveAttribute('href', '/host');
    expect(screen.getByRole('link', { name: /GUEST/ })).toHaveAttribute('href', '/join');
  });

  it('normalizes pasted room codes and excludes ambiguous characters', () => {
    expect(normalizeRoomCode(' 7k-o1p! ')).toBe('7KP');
  });

  it('renders Private creation without requiring a PIN', async () => {
    render(<MemoryRouter><CreateHostPage /></MemoryRouter>);
    expect(screen.getByLabelText('Your Name')).toBeRequired();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByLabelText('4-digit PIN')).not.toBeInTheDocument();
    expect(screen.getByText(/Only Guests with your room code/)).toBeVisible();
  });

  it('prepopulates direct join links and exposes a loading state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Promise<Response>(() => undefined));
    render(<MemoryRouter initialEntries={['/join/7K4P']}><Routes><Route path="/join/:roomCode" element={<JoinPage />} /></Routes></MemoryRouter>);
    expect(screen.getByLabelText('Room Code')).toHaveValue('7K4P');
    expect(screen.getByText(/join muted/i)).toBeVisible();
    fetchMock.mockRestore();
  });

  it('has clear ended and control states', async () => {
    const action = vi.fn();
    const { rerender } = render(<MemoryRouter><SessionEnded /></MemoryRouter>);
    expect(screen.getByText('This session has ended.')).toBeVisible();
    rerender(<ControlButton label="Mic Off" onClick={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mic Off' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('explains that mobile media needs HTTPS without faking a permission prompt', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    render(<PermissionHelp kind="microphone" guest busy={false} retry={vi.fn()} close={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Microphone access is off' })).toBeVisible();
    expect(screen.getByText('You can still watch and listen.')).toBeVisible();
    expect(screen.getByText(/secure HTTPS address/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'TRY AGAIN' })).toBeDisabled();
  });
});
