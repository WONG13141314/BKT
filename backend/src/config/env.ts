// Environment variables, validated once at startup so a misconfigured deploy
// fails immediately with a clear message instead of at the first query.
//
// This module is the first thing every entry point imports, so loading .env
// here guarantees it happens before anything reads a variable. In hosted
// environments there is no .env file and dotenv is a no-op — the platform's
// variables are already on process.env.
import 'dotenv/config';

import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Runtime connection. On Neon this is the pooled ("-pooler") host.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Unpooled connection, used only by `prisma migrate`. PgBouncer cannot run
  // migrations, so Neon deployments must also set this to the direct host.
  DIRECT_URL: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Long-lived on purpose: the token *is* the player's identity, and making a
  // child re-enter a nickname every week would reset their learner model.
  JWT_EXPIRES_IN: z.string().default('90d'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;
