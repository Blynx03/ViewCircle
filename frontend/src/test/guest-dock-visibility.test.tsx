import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestControls } from '../components/GuestControls';
const props = { micOn: false, micBusy: false, soundOn: true, iosStandalone: true, pipSupported: false, pipActive: false, hasVideo: true,
  onMic: vi.fn(), onSound: vi.fn(), onPip: vi.fn(), onSafari: vi.fn(), onPeople: vi.fn(), onLeave: vi.fn() };
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('keeps exactly the existing controls and hides the entire dock after 4.5 seconds', () => {
  const view = render(<GuestControls {...props} restoreSignal={0} />);
  const dock = screen.getByRole('navigation', { name: 'Guest controls' });
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Mic off', 'Sound on', 'Safari', 'People', 'Leave']);
  tick(4499); expect(dock).toHaveAttribute('aria-hidden', 'false');
  tick(1); expect(dock).toHaveAttribute('aria-hidden', 'true'); expect(dock).toHaveAttribute('inert');
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(<GuestControls {...props} restoreSignal={1} />);
  expect(dock).toHaveAttribute('aria-hidden', 'false');
  tick(4499); expect(dock).toHaveAttribute('aria-hidden', 'false');
  tick(1); expect(dock).toHaveAttribute('aria-hidden', 'true');
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
});
it('control interaction restarts the full countdown', () => {
  render(<GuestControls {...props} />);
  tick(4000); fireEvent.click(screen.getByRole('button', { name: 'Turn sound off' }));
  tick(4499); expect(screen.getByRole('button', { name: 'Leave session' })).toBeVisible();
  tick(1); expect(screen.queryByRole('button')).toBeNull();
});
it.each(['pointer', 'keyboard'])('does not hide during a held %s interaction', kind => {
  render(<GuestControls {...props} />);
  const mic = screen.getByRole('button', { name: 'Turn microphone on' });
  if (kind === 'pointer') fireEvent.pointerDown(mic); else fireEvent.keyDown(mic, { key: ' ' });
  tick(10000); expect(screen.getByRole('button', { name: 'Leave session' })).toBeVisible();
  if (kind === 'pointer') fireEvent.pointerCancel(window); else fireEvent.keyUp(window, { key: ' ' });
  tick(4499); expect(screen.getByRole('button', { name: 'Leave session' })).toBeVisible();
  tick(1); expect(screen.queryByRole('button')).toBeNull();
});
it.each(['panelOpen', 'micBusy'] as const)('pauses for %s and restarts after it closes', flag => {
  const view = render(<GuestControls {...props} />);
  tick(4000); view.rerender(<GuestControls {...props} {...{ [flag]: true }} />);
  tick(10000); expect(screen.getByRole('button', { name: 'Leave session' })).toBeVisible();
  view.rerender(<GuestControls {...props} />);
  tick(4499); expect(screen.getByRole('button', { name: 'Leave session' })).toBeVisible();
  tick(1); expect(screen.queryByRole('button')).toBeNull();
});
