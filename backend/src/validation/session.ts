import { z } from 'zod';
import { ROOM_ALPHABET } from '../utilities/security.js';

const name = z.string().trim().min(1).max(40);
const roomCode = z.string().trim().toUpperCase().regex(new RegExp(`^[${ROOM_ALPHABET}]{4}$`));
const pin = z.string().regex(/^\d{4}$/);

export const createSessionSchema = z.object({
  hostName: name,
  sessionName: z.string().trim().max(60).optional(),
  pin: pin.optional()
});
export const roomCodeSchema = z.object({ roomCode });
export const joinSessionSchema = z.object({ name, pin: pin.optional() });
export const participantSchema = z.object({ identity: z.string().min(1).max(100) });
export const lockSchema = z.object({ locked: z.boolean() });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
