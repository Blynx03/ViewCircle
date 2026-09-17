import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  OWNER_USERNAME: z.string().default(''),
  OWNER_PASSWORD_HASH: z.string().refine(value => !value || /^\$2[aby]\$(1[2-5])\$[./A-Za-z0-9]{53}$/.test(value), 'Use a bcrypt hash with cost 12–15.').default(''),
  OWNER_SESSION_SECRET: z.string().refine(value => !value || value.length >= 32, 'Use at least 32 random characters.').default(''),
  OWNER_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  OWNER_REMEMBER_ME_DAYS: z.coerce.number().positive().default(30),
  VISITOR_ACCESS_TTL_HOURS: z.coerce.number().positive().default(12),
  ACCESS_REQUEST_TTL_MINUTES: z.coerce.number().positive().default(30),
  ACCESS_REQUEST_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  ACCESS_REQUEST_GLOBAL_MAX_PER_HOUR: z.coerce.number().int().positive().default(30),
  OWNER_MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OWNER_LOGIN_LOCKOUT_MINUTES: z.coerce.number().positive().default(15),
  DEMO_MAX_ACTIVE_SESSIONS: z.coerce.number().int().positive().default(2),
  DEMO_MAX_SESSION_DURATION_MINUTES: z.coerce.number().positive().default(120),
  DEMO_MAX_SESSION_CREATIONS_PER_ACCESS: z.coerce.number().int().positive().default(5),
  TRUST_PROXY: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default(''),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && (!value.OWNER_USERNAME || !value.OWNER_PASSWORD_HASH || !value.OWNER_SESSION_SECRET)) {
    context.addIssue({ code: 'custom', message: 'Production requires OWNER_USERNAME, OWNER_PASSWORD_HASH, and OWNER_SESSION_SECRET.' });
  }
  const vapid = [value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY, value.VAPID_SUBJECT];
  if (vapid.some(Boolean) && !vapid.every(Boolean)) context.addIssue({ code: 'custom', message: 'Configure all three VAPID values or leave all empty.' });
});

const testDefaults = process.env.NODE_ENV === 'test' ? {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret'
} : {};

export const env = schema.parse({ ...process.env, ...testDefaults });
