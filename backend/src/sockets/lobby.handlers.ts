// Existing Socket.IO / Node lobby entry point retained for Render.
import { roomManager } from './lobby.manager';
import { gameService } from '../features/game/game.service';
import { publishGameStartTransition } from './game.handlers';
import { createLobbyHandlersRuntime } from './lobby.handlers.runtime';

const runtime = createLobbyHandlersRuntime({
  gameService, roomManager, publishGameStart: publishGameStartTransition,
});

export const registerLobbyHandlers = runtime.register;
export { LOBBY_RECONNECT_GRACE_MS, createLobbyHandlersRuntime } from './lobby.handlers.runtime';
export type { LobbyHandlersRuntime, LobbyHandlersRuntimeOptions, LobbyHandlersSnapshot } from './lobby.handlers.runtime';
