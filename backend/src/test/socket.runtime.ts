import { RoomManager } from '../sockets/lobby.manager';
import { createGameHandlersRuntime } from '../sockets/game.handlers.runtime';
import { createLobbyHandlersRuntime } from '../sockets/lobby.handlers.runtime';
import { gameService } from './game.service';
import { recordGameResult } from './game.persistence';

/** Unit-test singletons. Real rooms inject their own state, outbox and alarms. */
export const roomManager = new RoomManager();
const game = createGameHandlersRuntime({
  gameService, recordGameResult: (state, scores) => recordGameResult(state, scores),
});
const lobby = createLobbyHandlersRuntime({
  gameService, roomManager, publishGameStart: game.publishStart,
});
export const registerGameHandlers = game.register;
export const publishGameStartTransition = game.publishStart;
export const registerLobbyHandlers = lobby.register;
