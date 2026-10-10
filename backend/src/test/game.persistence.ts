import type { FinalScore, GameState } from '../features/game/game.types';
import type { AttemptRecord, PlayerPriors } from '../features/game/game.persistence.types';

/** Injectable, spyable test ports. This module never opens a database. */
export async function loadMasteryPriorsAfterWrites(_playerIds: string[]): Promise<Map<string, PlayerPriors>> {
  return new Map();
}

export function newGameId(): string { return crypto.randomUUID(); }
export function recordAttempt(_record: AttemptRecord): void {}
export function recordGameResult(_state: GameState, _scores: FinalScore[]): void {}
