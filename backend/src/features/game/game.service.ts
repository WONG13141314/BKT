// Conventional Node runtime retained for the Render deployment.
// Workers import game.runtime directly and inject their room-owned store/outbox.
import { createGameService } from './game.runtime';
import { loadMasteryPriorsAfterWrites, newGameId, recordAttempt } from './game.persistence';

export const gameService = createGameService({
  persistence: {
    loadMasteryPriorsAfterWrites: (playerIds) => loadMasteryPriorsAfterWrites(playerIds),
    newGameId: () => newGameId(),
    recordAttempt: (record) => recordAttempt(record),
  },
});

export { createGameService } from './game.runtime';
export type { GameService, GameRuntimeOptions } from './game.runtime';
