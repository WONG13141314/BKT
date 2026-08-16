import type { Server } from 'socket.io';
import type { GameState } from '../features/game/game.types';

export const PHASE_TIMEOUTS = {
  roll: 45_000,
  buy: 20_000,
  build: 30_000,
  endTurn: 10_000,
  movementFallback: 12_000,
  disconnectGrace: 60_000,
} as const;

export function getPhaseDeadline(
  state: GameState,
  now: number,
  options: { canBuild: boolean }
): number | null {
  switch (state.turnPhase) {
    case 'ROLL_PHASE':
      return now + PHASE_TIMEOUTS.roll;
    case 'BUY_DECISION':
      return now + PHASE_TIMEOUTS.buy;
    case 'END_TURN':
      return now + (options.canBuild ? PHASE_TIMEOUTS.build : PHASE_TIMEOUTS.endTurn);
    case 'MOVING':
      return now + PHASE_TIMEOUTS.movementFallback;
    default:
      return null;
  }
}

/** Maintains one authoritative expiry callback for each game. */
export class PhaseTimerRegistry {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  arm(_io: Server, gameId: string, deadline: number, onExpire: () => void): void {
    this.clear(gameId);

    const timer = setTimeout(() => {
      this.timers.delete(gameId);
      onExpire();
    }, Math.max(0, deadline - Date.now()));

    this.timers.set(gameId, timer);
  }

  clear(gameId: string): void {
    const timer = this.timers.get(gameId);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(gameId);
  }
}
