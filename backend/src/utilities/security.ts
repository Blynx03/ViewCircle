import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(): string {
  return Array.from({ length: 4 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
}

export function createSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAuthority(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
