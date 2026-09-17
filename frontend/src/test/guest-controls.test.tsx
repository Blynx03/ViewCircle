import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestControls } from '../components/GuestControls';
import { ControlButton } from '../components/SessionControls';
import { PortraitTip } from '../components/PortraitTip';
import { api } from '../api/client';
import { SafariMultitaskingHelp } from '../components/SafariMultitaskingHelp';
import { useBrowserEnvironment } from '../hooks/useBrowserEnvironment';
import { isIOSStandalone } from '../utilities/browser-environment';
import { guestNameFromFragment, sessionJoinLink } from '../utilities/session-link';

const base = { userAgent: '', platform: '', maxTouchPoints: 0 };
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 };
const ipadDesktop = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 };
describe('installed iOS detection', () => {
  it.each([
    ['iPhone Safari', iphone, false, false],
    ['iPhone Home Screen with WebKit standalone', { ...iphone, standalone: true }, false, true],
    ['iPhone standalone display mode', iphone, true, true],
    ['iPad Safari with desktop identity', ipadDesktop, false, false],
    ['iPad Home Screen with desktop identity', ipadDesktop, true, true],
    ['iPad mobile identity', { ...base, userAgent: 'iPad', standalone: true }, false, true],
    ['Android installed app', { ...base, userAgent: 'Android Chrome' }, true, false],
    ['Mac web app', { ...ipadDesktop, maxTouchPoints: 0 }, true, false],
    ['Windows desktop', { ...base, userAgent: 'Windows Chrome', maxTouchPoints: 10 }, true, false],
  ])('%s', (_label, environment, display, expected) => {
    expect(isIOSStandalone(environment, display)).toBe(expected);
  });
  it('updates when display mode changes and removes listeners', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iphone.userAgent);
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const match = vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    const hook = renderHook(useBrowserEnvironment);
    expect(hook.result.current.iosStandalone).toBe(false);
    media.matches = true;
    act(() => { (media.addEventListener.mock.calls[0]?.[1] as () => void)(); });
    expect(hook.result.current.iosStandalone).toBe(true);
    hook.unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    match.mockRestore();
  });
});

const props = {
  micOn: false, micBusy: false, soundOn: true,
  iosStandalone: false,
  pipSupported: true, pipActive: false, hasVideo: true,
  onMic: vi.fn(), onSound: vi.fn(),
  onPip: vi.fn(), onSafari: vi.fn(), onPeople: vi.fn(), onLeave: vi.fn(),
};
beforeEach(() => {
  sessionStorage.clear();
  if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
describe('Guest dock', () => {
  it('replaces PiP with Safari guidance only in installed iOS mode', async () => {
    const view = render(<GuestControls {...props} iosStandalone />);
    expect(screen.queryByRole('button', { name: 'Picture in Picture' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue while using other apps' }));
    expect(props.onSafari).toHaveBeenCalledOnce();
    expect(props.onPip).not.toHaveBeenCalled();
    view.rerender(<GuestControls {...props} />);
    expect(screen.queryByRole('button', { name: 'Continue while using other apps' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Picture in Picture' }));
    expect(props.onPip).toHaveBeenCalledOnce();
  });
  it('requires Host video and PiP capability, but keeps an active PiP return action', () => {
    const view = render(<GuestControls {...props} hasVideo={false} />);
    expect(screen.queryByRole('button', { name: 'Picture in Picture' })).not.toBeInTheDocument();
    view.rerender(<GuestControls {...props} pipSupported={false} />);
    expect(screen.queryByRole('button', { name: 'Picture in Picture' })).not.toBeInTheDocument();
    view.rerender(<GuestControls {...props} pipActive hasVideo={false} />);
    expect(screen.getByRole('button', { name: 'Return to ViewCircle' })).toBeVisible();
  });
  it('keeps Mic and destructive Leave accessible, with no Rotate or Fullscreen', async () => {
    render(<GuestControls {...props} />);
    expect(screen.getByRole('button', { name: 'Turn microphone on' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /rotate|landscape|portrait|fullscreen|full screen/i })).not.toBeInTheDocument();
    const leave = screen.getByRole('button', { name: 'Leave session' });
    expect(leave).toHaveClass('is-danger'); await userEvent.click(leave);
    expect(props.onLeave).toHaveBeenCalledOnce();
  });
  it('uses the same icon/label and active border classes for Host controls', () => {
    render(<ControlButton icon="camera" label="Camera On" active onClick={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Camera On' });
    expect(button).toHaveClass('dock-button'); expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).not.toBeNull(); expect(button.querySelector('span')).toHaveTextContent('Camera On');
  });
  it('shows a passive mobile portrait tip once, hides on rotation, and cleans up', () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const match = vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    const view = render(<PortraitTip sessionKey="one" hasVideo />);
    expect(screen.getByText('Rotate your device for a wider view.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    media.matches = false; act(() => { (media.addEventListener.mock.calls[0]?.[1] as () => void)(); });
    expect(screen.queryByText('Rotate your device for a wider view.')).not.toBeInTheDocument();
    view.unmount(); media.matches = true;
    render(<PortraitTip sessionKey="one" hasVideo />);
    expect(screen.queryByText('Rotate your device for a wider view.')).not.toBeInTheDocument();
    expect(media.removeEventListener).toHaveBeenCalled(); match.mockRestore();
  });
  it('survives StrictMode and disappears after six seconds', () => {
    vi.useFakeTimers();
    const match = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const view = render(<StrictMode><PortraitTip sessionKey="strict" hasVideo /></StrictMode>);
    expect(screen.getByText('Rotate your device for a wider view.')).toBeVisible();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByText('Rotate your device for a wider view.')).not.toBeInTheDocument();
    view.unmount(); match.mockRestore(); vi.useRealTimers();
  });
  it('does not show a portrait tip on desktop', () => {
    const match = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<PortraitTip sessionKey="desktop" hasVideo />);
    expect(screen.queryByText('Rotate your device for a wider view.')).not.toBeInTheDocument(); match.mockRestore();
  });

});

describe('Safari instructions', () => {
  it('builds a public room link and safely prefills the display name from a fragment', () => {
    const link = new URL(sessionJoinLink('https://viewcircle.example', '7K4P', 'Alex & Jo'));
    expect(link.pathname).toBe('/join/7K4P');
    expect(link.search).toBe('');
    expect(guestNameFromFragment(link.hash)).toBe('Alex & Jo');
    expect(guestNameFromFragment('#pin=1234&token=secret')).toBe('');
    expect(guestNameFromFragment(`#name=${'a'.repeat(100)}`)).toHaveLength(40);
  });
  it('copies the join link without pretending to launch Safari, and offers manual copy on denial', async () => {
    const user = userEvent.setup();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const close = vi.fn();
    const getSession = vi.spyOn(api, 'getSession').mockResolvedValue({ locked: false } as Awaited<ReturnType<typeof api.getSession>>);
    const view = render(<SafariMultitaskingHelp roomCode="7K4P" guestName="Alex" close={close} />);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Continue in Safari' })).toBeVisible();
    expect(screen.queryByText(/session is locked/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open in Safari' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy & Continue' }));
    expect(copy).toHaveBeenCalledWith(sessionJoinLink(window.location.origin, '7K4P', 'Alex'));
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    copy.mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy & Continue' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Touch and hold'));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
    getSession.mockResolvedValue({ locked: true } as Awaited<ReturnType<typeof api.getSession>>);
    view.rerender(<SafariMultitaskingHelp roomCode="ABCD" guestName="Alex" close={close} />);
    expect(await screen.findByText(/This session is locked/)).toBeVisible(); getSession.mockRestore();
  });
});
