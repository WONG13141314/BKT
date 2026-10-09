import type { GameState, MathChallenge, PlayerState } from './game.types';

export interface PlayerPriors {
  /** skillName → stored P(L). */
  mastery: Record<string, number>;
  /** skillName → lifetime independent answers, excluding hints and timeouts. */
  attempts: Record<string, number>;
}

export interface AttemptRecord {
  player: PlayerState;
  /** The `Game.id` this attempt belongs to — see `GameState.dbGameId`. */
  dbGameId: string;
  challenge: MathChallenge;
  selectedIndex: number | null;
  timeMs: number;
  previousMastery: number;
  newMastery: number;
  isCorrect: boolean;
}

/** Persistence supplied by the hosting runtime; recording is synchronous into its queue/outbox. */
export interface GamePersistencePort {
  loadMasteryPriorsAfterWrites(playerIds: string[]): Promise<Map<string, PlayerPriors>>;
  newGameId(): string;
  recordAttempt(record: AttemptRecord): void;
}

/** A room-owned store. Different room runtimes never share live state. */
export interface GameStateStore {
  get(gameId: string): GameState | undefined;
  set(gameId: string, state: GameState): unknown;
  delete(gameId: string): unknown;
  values(): Iterable<GameState>;
}
