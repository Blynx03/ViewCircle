export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeRoomCode(value: string): string {
  return [...value.toUpperCase()].filter((character) => ROOM_ALPHABET.includes(character)).slice(0, 4).join('');
}
