import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders Host creation fields and protects private sessions with four digits', async () => {
    render(<MemoryRouter><CreateHostPage /></MemoryRouter>);
    expect(screen.getByLabelText('Your Name')).toBeRequired();
    await userEvent.click(screen.getByRole('checkbox'));
    const pin = screen.getByLabelText('4-digit PIN');
    fireEvent.change(pin, { target: { value: '12ab34' } });
    expect(pin).toHaveValue('1234');
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
    expect(screen.getByText('The Host has ended this session.')).toBeVisible();
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
