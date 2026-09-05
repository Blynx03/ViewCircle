import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

const testDefaults = process.env.NODE_ENV === 'test' ? {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret'
} : {};

export const env = schema.parse({ ...process.env, ...testDefaults });
