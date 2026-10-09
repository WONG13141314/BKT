import type { Server } from 'socket.io';
import type { GameState } from '../features/game/game.types';
import { nodeTimerScheduler, type TimerScheduler } from './runtime.scheduler';

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
  private readonly timers = new Map<string, unknown>();

  constructor(private readonly scheduler: TimerScheduler = nodeTimerScheduler) {}

  arm(_io: Server, gameId: string, deadline: number, onExpire: () => void): void {
    this.clear(gameId);

    const timer = this.scheduler.setTimeout(() => {
      this.timers.delete(gameId);
      onExpire();
    }, Math.max(0, deadline - Date.now()), `phase:${gameId}`);

    this.timers.set(gameId, timer);
  }

  clear(gameId: string): void {
    const timer = this.timers.get(gameId);
    if (!this.timers.has(gameId)) return;
    this.scheduler.clearTimeout(timer);
    this.timers.delete(gameId);
  }

  clearAll(): void {
    for (const gameId of this.timers.keys()) this.clear(gameId);
  }
}
