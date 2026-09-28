import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RoomEvent, type Room } from 'livekit-client';
import { SessionChat } from '../components/SessionChat';
import { CHAT_COLORS, participantColor } from '../utilities/chat';
function fixture(identity = 'guest-me') {
  const listeners = new Set<(...args: unknown[]) => void>();
  const publishData = vi.fn(async () => {});
  const room = { localParticipant: { identity, name: 'Me', metadata: '{"chatColor":2}', publishData }, on: (event: RoomEvent, cb: (...args: unknown[]) => void) => { if (event === RoomEvent.DataReceived) listeners.add(cb); }, off: (_: string, cb: (...args: unknown[]) => void) => listeners.delete(cb) };
  const incoming = (text: string, sender = 'guest-peer') => act(() => listeners.forEach(cb => cb(new TextEncoder().encode(JSON.stringify({ text, name: 'Spoof' })), { identity: sender, name: 'Peer', metadata: '{"chatColor":3}' }, undefined, 'viewcircle.chat.v1')));
  const view = render(<SessionChat roomRef={{ current: room as unknown as Room }} connection="connected" />);
  return { ...view, incoming, publishData };
}
it.each(['host-me', 'guest-me'])('%s sends reliable room-wide messages with sender names', async identity => {
  const { publishData } = fixture(identity); await userEvent.click(screen.getByRole('button', { name: 'Open chat' }));
  await userEvent.type(screen.getByRole('textbox'), 'Hello{Enter}');
  expect(publishData).toHaveBeenCalledWith(expect.anything(), { reliable: true, topic: 'viewcircle.chat.v1' });
  expect(screen.getByText('Me:')).toBeVisible(); expect(screen.getByRole('log')).toHaveTextContent('Hello');
  expect(screen.getByRole('textbox')).toHaveValue('');
});
it('counts only incoming unread messages, clears glow on open, and drops history on unmount', async () => {
  const chat = fixture(); chat.incoming('Own', 'guest-me'); expect(screen.getByRole('button')).not.toHaveClass('has-unread');
  chat.incoming('First'); chat.incoming('Second');
  expect(screen.getByRole('button', { name: 'Open chat, 2 unread messages' })).toHaveClass('has-unread');
  await userEvent.click(screen.getByRole('button'));
  expect(screen.getByText('First')).toBeVisible(); expect(screen.queryByText('Spoof:')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse chat' })).not.toHaveClass('has-unread');
  await userEvent.click(screen.getByRole('button', { name: 'Collapse chat' })); expect(screen.queryByRole('log')).not.toBeInTheDocument();
  chat.unmount(); fixture(); await userEvent.click(screen.getByRole('button')); expect(screen.queryByText('First')).not.toBeInTheDocument();
});
it('scrolls when near bottom but preserves manual review, and bounds malformed messages', async () => {
  const chat = fixture(); await userEvent.click(screen.getByRole('button'));
  const list = screen.getByRole('log');
  Object.defineProperties(list, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
  list.scrollTop = 790; fireEvent.scroll(list); chat.incoming('Latest'); expect(list.scrollTop).toBe(1000);
  list.scrollTop = 100; fireEvent.scroll(list); chat.incoming('Review'); expect(list.scrollTop).toBe(100);
  chat.incoming('x'.repeat(501)); expect(list).not.toHaveTextContent('x'.repeat(501));
  list.scrollTop = 800; fireEvent.scroll(list); chat.incoming('Resume'); expect(list.scrollTop).toBe(1000);
});
it('uses stable distinct server slots and safely handles old/malformed metadata', () => {
  expect(new Set(CHAT_COLORS).size).toBe(CHAT_COLORS.length);
  for (let slot = 0; slot < 9; slot++) expect(participantColor(JSON.stringify({ chatColor: slot }))).toBe(CHAT_COLORS[slot]);
  expect(participantColor('null')).toBe('#ffffff'); expect(participantColor('bad')).toBe('#ffffff');
});

it('delivers Host and Guest sends to every other room participant', async () => {
  type Callback = (...args: unknown[]) => void;
  const callbacks = new Map<string, Callback>();
  const rooms = ['host-a', 'guest-a', 'guest-b'].map((identity, index) => ({
    localParticipant: {
      identity, name: identity, metadata: JSON.stringify({ chatColor: index }),
      publishData: async (payload: Uint8Array, options: { topic: string }) => {
        for (const [recipient, callback] of callbacks) if (recipient !== identity) callback(payload, { identity, name: identity, metadata: JSON.stringify({ chatColor: index }) }, undefined, options.topic);
      },
    },
    on: (_event: RoomEvent, callback: Callback) => callbacks.set(identity, callback),
    off: () => callbacks.delete(identity),
  }));
  render(<>{rooms.map(room => <SessionChat key={room.localParticipant.identity} roomRef={{ current: room as unknown as Room }} connection="connected" />)}</>);
  const chats = screen.getAllByRole('complementary');
  for (const chat of chats) await userEvent.click(within(chat).getByRole('button'));
  await userEvent.type(within(chats[0]!).getByRole('textbox'), 'Host message{Enter}');
  await userEvent.type(within(chats[1]!).getByRole('textbox'), 'Guest message{Enter}');
  for (const chat of chats) {
    expect(within(chat).getByRole('log')).toHaveTextContent('host-a: Host message');
    expect(within(chat).getByRole('log')).toHaveTextContent('guest-a: Guest message');
  }
});
it('preserves a failed draft and reports send failure without adding a false message', async () => {
  const chat = fixture(); chat.publishData.mockRejectedValueOnce(new Error('offline'));
  await userEvent.click(screen.getByRole('button'));
  await userEvent.type(screen.getByRole('textbox'), 'Retry me{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('Message not sent');
  expect(screen.getByRole('textbox')).toHaveValue('Retry me');
  expect(screen.getByRole('log')).not.toHaveTextContent('Retry me');
});
it('fades aging messages without removing them from review', () => {
  vi.useFakeTimers();
  try {
    const chat = fixture(); fireEvent.click(screen.getByRole('button')); chat.incoming('Aging');
    const message = screen.getByText('Peer:').closest('p')!;
    expect(message.style.opacity).toBe('1');
    act(() => { vi.advanceTimersByTime(120000); });
    expect(message.style.opacity).toBe('0.45'); expect(message).toHaveTextContent('Aging');
    chat.unmount();
  } finally { vi.useRealTimers(); }
});
