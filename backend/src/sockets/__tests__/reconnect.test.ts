import { gameService } from '../../features/game/game.service';
import type { DuelState } from '../../features/game/game.types';
import { makeFinishedFixture, makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { registerGameHandlers } from '../game.handlers';
import { registerLobbyHandlers } from '../lobby.handlers';
import { roomManager } from '../lobby.manager';
import { SocketPresence } from '../presence.manager';
import { makeServer, makeSocket } from './socket.harness';

const NOW = 1_700_000_000_000;
const LOBBY_RECONNECT_GRACE_MS = 60_000;

describe('authoritative game recovery', () => {
  const gameIds: string[] = [];

  afterEach(() => {
    for (const gameId of gameIds.splice(0)) gameService.removeGame(gameId);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('re-emits the reconnecting duellist question', async () => {
    const game = makeGameState({ id: 'game_RECONNECT_DUEL', turnPhase: 'MATH_DUEL' });
    gameIds.push(game.id);
    game.duelState = {
      tileIndex: 1,
      tileName: 'Addition Avenue',
      rentAmount: 50,
      challenger: {
        playerId: game.players[0].id,
        challenge: makePrivateChallenge({ id: 'challenger-question', context: 'MATH_DUEL' }),
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      owner: {
        playerId: game.players[1].id,
        challenge: makePrivateChallenge({ id: 'owner-question', context: 'MATH_DUEL' }),
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      startedAt: NOW,
      resolution: null,
    } satisfies DuelState;
    gameService.replaceState(game.id, game);

    const ownerSocket = makeSocket({ player: { id: game.players[1].playerId } });
    const io = makeServer([ownerSocket], game.id);
    registerGameHandlers(io, ownerSocket);

    await ownerSocket.trigger('game:request-state', { gameId: game.id });

    expect(ownerSocket.emit).toHaveBeenCalledWith('game:duel', expect.objectContaining({
      myChallenge: expect.objectContaining({ id: game.duelState!.owner.challenge.id }),
    }));
  });

  it('does not restore a reconnecting duellist question after that side timed out', async () => {
    const game = makeGameState({ id: 'game_RECONNECT_TIMED_OUT_DUEL', turnPhase: 'MATH_DUEL' });
    gameIds.push(game.id);
    game.duelState = {
      tileIndex: 1,
      tileName: 'Addition Avenue',
      rentAmount: 50,
      challenger: {
        playerId: game.players[0].id,
        challenge: makePrivateChallenge({ id: 'challenger-question', context: 'MATH_DUEL' }),
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      owner: {
        playerId: game.players[1].id,
        challenge: makePrivateChallenge({ id: 'expired-owner-question', context: 'MATH_DUEL' }),
        selectedIndex: null,
        isCorrect: false,
        timedOut: true,
        timeMs: 15_000,
        previousMastery: null,
        newMastery: null,
      },
      startedAt: NOW,
      resolution: null,
    } satisfies DuelState;
    gameService.replaceState(game.id, game);

    const ownerSocket = makeSocket({ player: { id: game.players[1].playerId } });
    const io = makeServer([ownerSocket], game.id);
    registerGameHandlers(io, ownerSocket);

    await ownerSocket.trigger('game:request-state', { gameId: game.id });

    expect(ownerSocket.emit).toHaveBeenCalledWith('game:duel', expect.objectContaining({
      myChallenge: null,
      duel: expect.objectContaining({ owner: expect.objectContaining({ hasAnswered: true }) }),
    }));
  });

  it('re-emits scores and only the viewer report for a finished game', async () => {
    const { state: finishedGame } = makeFinishedFixture();
    finishedGame.id = 'game_RECONNECT_FINISHED';
    finishedGame.players[0] = {
      ...finishedGame.players[0],
      masteryStates: { ...finishedGame.players[0].masteryStates, Addition: 0.11 },
    };
    finishedGame.players[1] = {
      ...finishedGame.players[1],
      masteryStates: { ...finishedGame.players[1].masteryStates, Addition: 0.97 },
    };
    gameIds.push(finishedGame.id);
    gameService.replaceState(finishedGame.id, finishedGame);

    const playerOneSocket = makeSocket({ player: { id: finishedGame.players[0].playerId } });
    const io = makeServer([playerOneSocket], finishedGame.id);
    registerGameHandlers(io, playerOneSocket);

    await playerOneSocket.trigger('game:request-state', { gameId: finishedGame.id });

    expect(playerOneSocket.emit).toHaveBeenCalledWith('game:finished', {
      scores: expect.any(Array),
      masteryReport: expect.objectContaining({ playerId: finishedGame.players[0].id }),
    });
    expect(JSON.stringify(playerOneSocket.emit.mock.calls)).not.toContain('0.97');
  });

  it('derives a finished report for only the requested human player', () => {
    const game = makeGameState({ id: 'game_RECONNECT_REPORT' });
    gameIds.push(game.id);
    gameService.replaceState(game.id, game);
    const service = gameService as typeof gameService & {
      getMasteryReportForPlayer?: (gameId: string, playerId: string) => { playerId: string } | null;
    };

    expect(service.getMasteryReportForPlayer).toEqual(expect.any(Function));
    if (!service.getMasteryReportForPlayer) return;

    expect(service.getMasteryReportForPlayer(game.id, game.players[0].playerId)).toEqual(
      expect.objectContaining({ playerId: game.players[0].id })
    );
    expect(service.getMasteryReportForPlayer(game.id, game.players[1].playerId)).toEqual(
      expect.objectContaining({ playerId: game.players[1].id })
    );
  });

  it('does not replace a current movement fallback when its player reconnects', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const game = makeGameState({
      id: 'game_RECONNECT_MOVING',
      turnPhase: 'MOVING',
      phaseDeadline: NOW + 4_000,
      phaseDeadlineFor: 'MOVING',
    });
    gameIds.push(game.id);
    gameService.replaceState(game.id, game);

    const socket = makeSocket({ player: { id: game.players[0].playerId } });
    const io = makeServer([socket], game.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:request-state', { gameId: game.id });

    expect(gameService.getGameSync(game.id)?.phaseDeadline).toBe(NOW + 4_000);
  });
});

describe('lobby recovery', () => {
  const roomCodes: string[] = [];

  afterEach(() => {
    for (const code of roomCodes.splice(0)) {
      const room = roomManager.getRoom(code);
      for (const player of room?.players.values() ?? []) roomManager.removePlayer(player.id);
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('cancels pending lobby removal and returns the latest room on resume', async () => {
    jest.useFakeTimers();
    const playerId = 'lobby-resume-player';
    const room = roomManager.createRoom(playerId, 'Aina', 'ship');
    roomCodes.push(room.code);
    const disconnectedSocket = makeSocket({ player: { id: playerId, displayName: 'Aina', avatar: 'ship' } });
    const resumedSocket = makeSocket({ player: { id: playerId, displayName: 'Aina', avatar: 'ship' } });
    const io = makeServer([disconnectedSocket, resumedSocket], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect(playerId, disconnectedSocket.id);
    registerLobbyHandlers(io, disconnectedSocket, presence);

    await disconnectedSocket.trigger('disconnect');
    expect(roomManager.getRoom(room.code)?.players.has(playerId)).toBe(true);

    presence.connect(playerId, resumedSocket.id);
    registerLobbyHandlers(io, resumedSocket, presence);
    await resumedSocket.trigger('room:resume', { code: room.code });
    jest.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS);

    expect(resumedSocket.join).toHaveBeenCalledWith(`room:${room.code}`);
    expect(resumedSocket.emit).toHaveBeenCalledWith('room:update', roomManager.serializeRoom(room));
    expect(roomManager.getRoom(room.code)?.players.has(playerId)).toBe(true);
  });

  it('tells a player whose grace window elapsed that their lobby seat was removed', async () => {
    jest.useFakeTimers();
    const playerId = 'lobby-removed-player';
    const room = roomManager.createRoom(playerId, 'Ben', 'boot');
    roomCodes.push(room.code);
    const disconnectedSocket = makeSocket({ player: { id: playerId, displayName: 'Ben', avatar: 'boot' } });
    const resumedSocket = makeSocket({ player: { id: playerId, displayName: 'Ben', avatar: 'boot' } });
    const io = makeServer([disconnectedSocket, resumedSocket], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect(playerId, disconnectedSocket.id);
    registerLobbyHandlers(io, disconnectedSocket, presence);

    await disconnectedSocket.trigger('disconnect');
    jest.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS);

    presence.connect(playerId, resumedSocket.id);
    registerLobbyHandlers(io, resumedSocket, presence);
    await resumedSocket.trigger('room:resume', { code: room.code });

    expect(resumedSocket.emit).toHaveBeenCalledWith('room:removed', {
      code: room.code,
      message: 'Your place in this room is no longer available.',
    });
  });

  it('resumes an authenticated playing-room seat into game recovery', async () => {
    jest.useFakeTimers();
    const playerId = 'playing-resume-player';
    const room = roomManager.createRoom(playerId, 'Chen', 'top_hat');
    roomCodes.push(room.code);
    roomManager.addBot(room.code, playerId);
    roomManager.setRoomStatus(room.code, 'playing');
    const gameId = `game_${room.code}`;
    const game = makeGameState({ id: gameId });
    game.players[0] = { ...game.players[0], id: playerId, playerId };
    gameService.replaceState(gameId, game);

    const socket = makeSocket({ player: { id: playerId, displayName: 'Chen', avatar: 'top_hat' } });
    const io = makeServer([socket], gameId);
    const presence = new SocketPresence();
    presence.connect(playerId, socket.id);
    registerLobbyHandlers(io, socket, presence);
    registerGameHandlers(io, socket, presence);

    await socket.trigger('room:resume', { code: room.code });

    expect(socket.data.gameId).toBe(gameId);
    expect(socket.emit).toHaveBeenCalledWith('game:start', { roomCode: room.code });

    await socket.trigger('game:request-state', { gameId });
    expect(socket.emit).toHaveBeenCalledWith('game:state', expect.anything());
    gameService.removeGame(gameId);
  });

  it('rejects a playing-room resume after the game retention window ended', async () => {
    const playerId = 'expired-playing-resume-player';
    const room = roomManager.createRoom(playerId, 'Devi', 'scottie_dog');
    roomCodes.push(room.code);
    roomManager.addBot(room.code, playerId);
    roomManager.setRoomStatus(room.code, 'playing');
    const socket = makeSocket({ player: { id: playerId, displayName: 'Devi', avatar: 'scottie_dog' } });
    const io = makeServer([socket], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect(playerId, socket.id);
    registerLobbyHandlers(io, socket, presence);

    await socket.trigger('room:resume', { code: room.code });

    expect(socket.emit).toHaveBeenCalledWith('room:removed', {
      code: room.code,
      message: 'This game is no longer available.',
    });
    expect(socket.emit).not.toHaveBeenCalledWith('game:start', expect.anything());
  });
});
