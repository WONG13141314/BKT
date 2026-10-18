import type { RealtimeServer as Server } from './realtime.types';
import type { GameState } from '../features/game/game.types';
import { getCurrentPlayer } from '../features/game/game.engine';
import { getLevelUpCost, ownsFullColorGroup } from '../features/game/board.config';
import { defaultTimerScheduler, type TimerScheduler } from './runtime.scheduler';

export const PHASE_TIMEOUTS = {
  roll: 45_000,
  /** Reading the deed and choosing; 20s proved tight in a playtest. */
  buy: 30_000,
  build: 30_000,
  endTurn: 10_000,
  movementFallback: 12_000,
  /** Answer card shown before a roll that follows a graded answer (Math Escape). */
  answerReview: 6_000,
  disconnectGrace: 60_000,
  /** Longest the first turn waits for every learner's board to draw. */
  openingWait: 15_000,
  /** "Round 1 · X goes first" banner, once every board is ready. */
  openingBanner: 1_500,
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

  constructor(private readonly scheduler: TimerScheduler = defaultTimerScheduler) {}

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

/** True when the active player could still build a house this End Turn. */
export function canBuildOnEndTurn(state: GameState): boolean {
  if (state.turnPhase !== 'END_TURN') return false;

  const player = getCurrentPlayer(state);
  return state.properties.some((property) => {
    const tile = state.tiles[property.tileIndex];
    if (
      !tile ||
      tile.type !== 'PROPERTY' ||
      !tile.colorGroup ||
      property.ownerId !== player.id ||
      property.isLeveledUp ||
      !ownsFullColorGroup(player.properties, tile.colorGroup)
    ) return false;

    return player.hasLevelUpToken || player.money >= getLevelUpCost(tile);
  });
}

/** Identifies one occurrence of a turn phase, so disconnect grace is granted once. */
export function disconnectGraceKey(state: GameState): string {
  return [state.dbGameId, state.round, state.currentPlayerIndex, state.turnPhase, state.diceRollId].join('|');
}
