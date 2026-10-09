// Existing Socket.IO / Node entry point retained for Render.
import { gameService } from '../features/game/game.service';
import { recordGameResult } from '../features/game/game.persistence';
import { createGameHandlersRuntime } from './game.handlers.runtime';

const runtime = createGameHandlersRuntime({
  gameService,
  recordGameResult: (state, scores) => recordGameResult(state, scores),
});

export const registerGameHandlers = runtime.register;
export const publishGameStartTransition = runtime.publishStart;
export { createGameHandlersRuntime } from './game.handlers.runtime';
export type { GameHandlersRuntime, GameHandlersRuntimeOptions, GameHandlersSnapshot } from './game.handlers.runtime';
