import { z } from 'zod';

/** Monopoly tokens. Stored as ids, not emoji, so the client owns the rendering. */
export const AVATARS = [
  'tophat',
  'car',
  'dog',
  'ship',
  'boot',
  'thimble',
  'wheelbarrow',
  'iron',
] as const;

export type Avatar = (typeof AVATARS)[number];

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Nickname must be at least 2 characters')
  .max(16, 'Nickname must be 16 characters or fewer');

export const guestSchema = z.object({
  displayName: displayNameSchema,
  avatar: z.enum(AVATARS).default('tophat'),
});

/** Lowercased so a player never fails to sign in over capitalisation. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(16, 'Username must be 16 characters or fewer')
  .regex(/^[a-z0-9_]+$/, 'Use letters, numbers and underscores only');

/** A 6-digit PIN rather than a password — the players are primary-school age. */
export const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

export const claimSchema = z.object({
  username: usernameSchema,
  pin: pinSchema,
});

export const signInSchema = z.object({
  username: usernameSchema,
  pin: pinSchema,
});

export type GuestInput = z.infer<typeof guestSchema>;
export type ClaimInput = z.infer<typeof claimSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
