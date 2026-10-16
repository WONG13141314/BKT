import type { MathChallenge } from '../types/game.types';

/**
 * Re-expresses a question's server-time expiry on this device's clock.
 *
 * School devices often have a wrong clock. The server stamps its own time on
 * each question, so the offset is measured once, when the question arrives,
 * and the countdown components keep comparing against `Date.now()`.
 */
export function toDeviceClock(challenge: MathChallenge, receivedAt: number = Date.now()): MathChallenge {
  if (typeof challenge.serverNow !== 'number') return challenge;
  return { ...challenge, expiresAt: challenge.expiresAt + (receivedAt - challenge.serverNow) };
}
