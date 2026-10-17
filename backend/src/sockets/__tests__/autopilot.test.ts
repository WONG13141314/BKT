import { createGameService } from '../../features/game/game.runtime';
import { createGameHandlersRuntime } from '../game.handlers.runtime';
import { RoomManager } from '../lobby.manager';
import { SocketPresence } from '../presence.manager';
import { PHASE_TIMEOUTS } from '../phase.deadlines';
import { processCardChallengeAnswer } from '../../features/game/game.engine';
import { isRecordablePlayer } from '../../features/game/game.persistence.shared';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import type { AttemptRecord } from '../../features/game/game.persistence.types';
import { makeServer, makeSocket } from './socket.harness';

const gameId = 'game_TEST';

/** An isolated room runtime, so away timers never leak between tests. */
function runtime() {
  const attempts: AttemptRecord[] = [];
  const service = createGameService({ persistence: {
    loadMasteryPriorsAfterWrites: async () => new Map(),
    newGameId: () => 'match-1',
    recordAttempt: (record) => { attempts.push(record); },
  } });
  const roomManager = new RoomManager({ fixedCode: 'TEST' });
  const presence = new SocketPresence();
  const handlers = createGameHandlersRuntime({
    gameService: service, roomManager, presence, recordGameResult: () => {},
  });
  return { service, roomManager, presence, handlers, attempts };
}

function seated(rt: ReturnType<typeof runtime>, accountId: string, sockets: ReturnType<typeof makeSocket>[]) {
  const socket = makeSocket({ player: { id: accountId }, gameId });
  rt.presence.connect(accountId, socket.id);
  sockets.push(socket);
  return socket;
}

describe('away learners', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('puts a learner offline past reconnect grace on autopilot and hands the seat back on reconnect', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    seated(rt, 'db-player-1', sockets);
    const away = seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);
    for (const socket of sockets) rt.handlers.register(io, socket, rt.presence);

    await away.trigger('disconnect');
    jest.advanceTimersByTime(PHASE_TIMEOUTS.disconnectGrace - 1);
    expect(rt.service.getGameSync(gameId)!.players[1].autopilot).not.toBe(true);
    jest.advanceTimersByTime(1);
    expect(rt.service.getGameSync(gameId)!.players[1].autopilot).toBe(true);

    const back = seated(rt, 'db-player-2', sockets);
    rt.handlers.register(io, back, rt.presence);
    await back.trigger('game:request-state', { gameId });
    expect(rt.service.getGameSync(gameId)!.players[1].autopilot).toBe(false);
  });

  it('does not put a learner on autopilot who reconnects within the grace', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    const first = seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);
    rt.handlers.register(io, first, rt.presence);

    await first.trigger('disconnect');
    jest.advanceTimersByTime(10_000);
    const back = seated(rt, 'db-player-2', sockets);
    rt.handlers.register(io, back, rt.presence);
    await back.trigger('game:request-state', { gameId });
    jest.advanceTimersByTime(PHASE_TIMEOUTS.disconnectGrace);

    expect(rt.service.getGameSync(gameId)!.players[1].autopilot).not.toBe(true);
  });

  it('hands a seat to autopilot at once when its learner leaves for another room', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    const leaver = seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);
    rt.handlers.register(io, leaver, rt.presence);

    await leaver.trigger('room:leave');

    expect(rt.service.getGameSync(gameId)!.players[1].autopilot).toBe(true);
  });

  it('lets a bot play an away seat turn so the table does not wait on its timeouts', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);

    rt.service.setAutopilot(gameId, 'db-player-1', true);
    rt.handlers.resume(io);
    jest.advanceTimersByTime(1_000);

    expect(rt.service.getGameSync(gameId)!.turnPhase).not.toBe('ROLL_PHASE');
  });

  it('never treats an autopilot answer as the learner\'s evidence', () => {
    const challenge = makePrivateChallenge({ startedAt: Date.now() });
    const state = makeGameState({
      turnPhase: 'CARD_MATH_CHALLENGE', currentChallenge: challenge,
      pendingTileEvent: { type: 'CHALLENGE_CARD', tileIndex: 3, tileName: 'Challenge Card' },
    });
    state.players[0] = { ...state.players[0], autopilot: true };
    const before = state.players[0];

    const { newState, result } = processCardChallengeAnswer(state, challenge.correctIndex);

    expect(result.isCorrect).toBe(true);
    expect(newState.players[0].masteryStates).toEqual(before.masteryStates);
    expect(newState.players[0].skillAttempts).toEqual(before.skillAttempts);
    expect(isRecordablePlayer(newState.players[0])).toBe(false);
    // The learner's shown and saved score excludes the bot's answer.
    expect(newState.players[0].totalQuestions).toBe(before.totalQuestions);
    expect(newState.players[0].totalCorrect).toBe(before.totalCorrect);
    expect(newState.players[0].streak).toBe(before.streak);
  });
});

describe('movement presentation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('continues 1.5 seconds after the rolling learner finishes, without waiting for a slow screen', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    const roller = seated(rt, 'db-player-1', sockets);
    seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);
    rt.handlers.register(io, roller, rt.presence);

    await roller.trigger('game:roll', { gameId });
    const moving = rt.service.getGameSync(gameId)!;
    await roller.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
    jest.advanceTimersByTime(1_499);
    expect(rt.service.getGameSync(gameId)!.turnPhase).toBe('MOVING');

    jest.advanceTimersByTime(1);
    expect(rt.service.getGameSync(gameId)!.turnPhase).not.toBe('MOVING');
  });

  it('does not let an onlooker hurry the rolling learner\'s own animation', async () => {
    const rt = runtime();
    rt.service.replaceState(gameId, makeGameState({ id: gameId }));
    const sockets: ReturnType<typeof makeSocket>[] = [];
    const roller = seated(rt, 'db-player-1', sockets);
    const onlooker = seated(rt, 'db-player-2', sockets);
    const io = makeServer(sockets, gameId);
    rt.handlers.register(io, roller, rt.presence);
    rt.handlers.register(io, onlooker, rt.presence);

    await roller.trigger('game:roll', { gameId });
    const moving = rt.service.getGameSync(gameId)!;
    await onlooker.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
    jest.advanceTimersByTime(5_000);

    expect(rt.service.getGameSync(gameId)!.turnPhase).toBe('MOVING');
  });
});

describe('finished room cleanup', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('releases the lobby with the finished match after the scoreboard window', async () => {
    jest.useFakeTimers();
    const rt = runtime();
    const room = rt.roomManager.createRoom('db-player-1', 'Aina', 'ship');
    rt.roomManager.joinRoom(room.code, 'db-player-2', 'Ben', 'boot');
    rt.roomManager.setRoomStatus(room.code, 'playing');
    rt.service.replaceState(gameId, makeGameState({ id: gameId, phase: 'FINISHED' }));

    rt.handlers.resume(makeServer([], gameId));
    jest.advanceTimersByTime(5 * 60_000);

    expect(rt.service.getGameSync(gameId)).toBeNull();
    expect(rt.roomManager.getRoom(room.code)).toBeUndefined();
  });
});
