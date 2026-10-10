import { createGameService } from '../features/game/game.runtime';
import { loadMasteryPriorsAfterWrites, newGameId, recordAttempt } from './game.persistence';

/** A shared unit-test runtime; production always constructs one runtime per room. */
export const gameService = createGameService({ persistence: {
  loadMasteryPriorsAfterWrites: (ids) => loadMasteryPriorsAfterWrites(ids),
  newGameId: () => newGameId(),
  recordAttempt: (record) => recordAttempt(record),
} });
