import { createGameService } from '../../features/game/game.runtime';
import type { GamePersistencePort } from '../../features/game/game.persistence.types';
import { makeGameState } from '../../test/game.fixtures';
import { createGameHandlersRuntime } from '../game.handlers.runtime';
import { createLobbyHandlersRuntime } from '../lobby.handlers.runtime';
import { RoomManager } from '../lobby.manager';
import { SocketPresence } from '../presence.manager';
import type { TimerScheduler } from '../runtime.scheduler';
import { makeServer, makeSocket } from './socket.harness';

function persistence(): GamePersistencePort {
  return {
    loadMasteryPriorsAfterWrites: async () => new Map(),
    newGameId: () => 'synthetic-match',
    recordAttempt: jest.fn(),
  };
}

class AlarmScheduler implements TimerScheduler {
  readonly tasks = new Map<string, { deadline: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number, key: string): unknown {
    this.tasks.set(key, { callback, deadline: Date.now() + delayMs });
    return key;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as string);
  }
}

describe('room-owned game runtime and alarm reconstruction', () => {
  afterEach(() => jest.restoreAllMocks());

  test('two runtimes never share games, including stall recovery', () => {
    const first = createGameService({ persistence: persistence() });
    const second = createGameService({ persistence: persistence() });
    first.replaceState('game_TEST', makeGameState());
    const untouched = second.replaceState('game_TEST', makeGameState());

    first.startRoll('game_TEST');
    expect(first.getGameSync('game_TEST')?.turnPhase).toBe('MOVING');
    expect(second.getGameSync('game_TEST')).toBe(untouched);
    first.resolveStalledTurn('game_TEST');
    expect(first.getGameSync('game_TEST')?.turnPhase).not.toBe('MOVING');
    expect(second.getGameSync('game_TEST')).toBe(untouched);
    expect(second.getGameSync('game_TEST')?.turnPhase).toBe('ROLL_PHASE');
  });

  test('wake preserves a movement deadline and the first viewer acknowledgement', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = createGameService({ persistence: persistence() });
    service.replaceState('game_TEST', makeGameState());
    const state = service.startRoll('game_TEST')!;
    const firstViewer = makeSocket({ player: { id: 'db-player-1' } });
    const secondViewer = makeSocket({ player: { id: 'db-player-2' } });
    const io = makeServer([firstViewer, secondViewer]);
    const scheduler = new AlarmScheduler();
    const handlers = createGameHandlersRuntime({ gameService: service, scheduler, recordGameResult: jest.fn() });
    handlers.register(io, firstViewer);
    handlers.register(io, secondViewer);
    handlers.publishStart(io, state);
    await firstViewer.trigger('game:movement-complete', { gameId: state.id, diceRollId: state.diceRollId });
    expect(service.getGameSync(state.id)?.turnPhase).toBe('MOVING');

    const savedGames = service.snapshot();
    const savedHandlers = handlers.snapshot();
    now.mockReturnValue(5_000);
    const restored = createGameService({ persistence: persistence() });
    restored.restore(savedGames);
    const restoredScheduler = new AlarmScheduler();
    const restoredHandlers = createGameHandlersRuntime({ gameService: restored, scheduler: restoredScheduler, recordGameResult: jest.fn() });
    restoredHandlers.restore(savedHandlers);
    const restoredFirst = makeSocket({ player: { id: 'db-player-1' } });
    const restoredSecond = makeSocket({ player: { id: 'db-player-2' } });
    const restoredIo = makeServer([restoredFirst, restoredSecond]);
    restoredHandlers.register(restoredIo, restoredFirst);
    restoredHandlers.register(restoredIo, restoredSecond);
    restoredHandlers.resume(restoredIo);
    expect(restoredScheduler.tasks.get('phase:game_TEST')?.deadline).toBe(13_000);
    await restoredSecond.trigger('game:movement-complete', { gameId: state.id, diceRollId: state.diceRollId });
    expect(restored.getGameSync(state.id)?.turnPhase).not.toBe('MOVING');
  });

  test('wake does not restart a bot thinking delay', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = createGameService({ persistence: persistence() });
    const state = makeGameState();
    state.players[0].isBot = true;
    service.replaceState(state.id, state);
    const scheduler = new AlarmScheduler();
    const handlers = createGameHandlersRuntime({ gameService: service, scheduler, recordGameResult: jest.fn() });
    const io = makeServer([]);
    handlers.publishStart(io, state);
    const saved = handlers.snapshot();
    now.mockReturnValue(1_500);
    const restoredService = createGameService({ persistence: persistence() });
    restoredService.restore(service.snapshot());
    const restoredScheduler = new AlarmScheduler();
    const restored = createGameHandlersRuntime({ gameService: restoredService, scheduler: restoredScheduler, recordGameResult: jest.fn() });
    restored.restore(saved);
    restored.resume(io);
    expect(restoredScheduler.tasks.get('bot-action:game_TEST')?.deadline).toBe(1_800);
  });

  test('lobby roster and disconnect grace survive a wake without extension', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const roomManager = new RoomManager({ fixedCode: 'TEST' });
    const presence = new SocketPresence();
    const socket = makeSocket({ player: { id: 'db-player-1', displayName: 'Synthetic', avatar: 'ship' } });
    const io = makeServer([socket]);
    const scheduler = new AlarmScheduler();
    const service = createGameService({ persistence: persistence() });
    const runtime = createLobbyHandlersRuntime({ gameService: service, roomManager, presence, scheduler, publishGameStart: jest.fn() });
    presence.connect('db-player-1', socket.id);
    runtime.register(io, socket);
    await socket.trigger('room:create');
    await socket.trigger('room:add-bot', { difficulty: 'hard' });
    await socket.trigger('disconnect');
    const roster = roomManager.snapshot();
    const deadlines = runtime.snapshot();

    now.mockReturnValue(30_000);
    const restoredRoom = new RoomManager({ fixedCode: 'TEST' });
    restoredRoom.restore(roster);
    const restoredScheduler = new AlarmScheduler();
    const restored = createLobbyHandlersRuntime({ gameService: service, roomManager: restoredRoom, scheduler: restoredScheduler, publishGameStart: jest.fn() });
    restored.restore(deadlines);
    restored.resume(makeServer([]));
    expect(restoredRoom.getRoom('TEST')?.players.size).toBe(2);
    expect(restoredScheduler.tasks.get('disconnect:TEST:db-player-1')?.deadline).toBe(61_000);
    restoredScheduler.tasks.get('disconnect:TEST:db-player-1')!.callback();
    expect(restoredRoom.getRoom('TEST')).toBeUndefined();
  });
});
