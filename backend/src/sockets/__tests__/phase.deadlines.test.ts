import type { Server } from 'socket.io';
import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import {
  getPhaseDeadline,
  PHASE_TIMEOUTS,
  PhaseTimerRegistry,
} from '../phase.deadlines';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';
import { SocketPresence } from '../presence.manager';

const NOW = 1_700_000_000_000;

describe('phase deadlines', () => {
  it.each([
    ['ROLL_PHASE', false, 45_000],
    ['BUY_DECISION', false, 20_000],
    ['END_TURN', false, 10_000],
    ['END_TURN', true, 30_000],
    ['MOVING', false, 12_000],
  ] as const)('uses the approved %s deadline', (phase, canBuild, expected) => {
    const state = makeGameState({ turnPhase: phase });

    expect(getPhaseDeadline(state, NOW, { canBuild })).toBe(NOW + expected);
  });

  it('does not assign a deadline to an unlisted phase', () => {
    const state = makeGameState({ turnPhase: 'CARD_DRAW' });

    expect(getPhaseDeadline(state, NOW, { canBuild: false })).toBeNull();
  });

  it('replaces a superseded timer before it can expire', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const registry = new PhaseTimerRegistry();
    const first = jest.fn();
    const replacement = jest.fn();

    registry.arm({} as Server, 'game_TEST', NOW + 1_000, first);
    registry.arm({} as Server, 'game_TEST', NOW + 2_000, replacement);
    jest.advanceTimersByTime(1_000);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000);

    expect(replacement).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('movement acknowledgement', () => {
  const gameId = 'game_TEST';

  beforeEach(() => {
    jest.useFakeTimers();
    gameService.replaceState(gameId, makeGameState({ id: gameId }));
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    gameService.removeGame(gameId);
    jest.restoreAllMocks();
  });

  async function advanceOnceAfterAcknowledgement(
    socket: ReturnType<typeof makeSocket>,
    diceRollId: number
  ) {
    await socket.trigger('game:movement-complete', { gameId, diceRollId: diceRollId - 1 });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');

    await socket.trigger('game:movement-complete', { gameId, diceRollId });
    const advanced = gameService.getGameSync(gameId)!;
    expect(advanced.turnPhase).not.toBe('MOVING');

    await socket.trigger('game:movement-complete', { gameId, diceRollId });
    expect(gameService.getGameSync(gameId)).toBe(advanced);
  }

  it('advances only once for a current movement acknowledgement', async () => {
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:roll', { gameId });
    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');
    expect(moving.phaseDeadline).toEqual(expect.any(Number));
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:state', expect.objectContaining({
      state: expect.objectContaining({
        turnPhase: 'MOVING',
        phaseDeadline: moving.phaseDeadline,
      }),
    }));

    await socket.trigger('game:movement-complete', {
      gameId,
      diceRollId: moving.diceRollId - 1,
    });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');

    await socket.trigger('game:movement-complete', {
      gameId,
      diceRollId: moving.diceRollId,
    });
    const advanced = gameService.getGameSync(gameId)!;
    expect(advanced.turnPhase).not.toBe('MOVING');

    await socket.trigger('game:movement-complete', {
      gameId,
      diceRollId: moving.diceRollId,
    });
    expect(gameService.getGameSync(gameId)).toBe(advanced);
  });

  it('gives a disconnected active player the approved grace interval', async () => {
    const socket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('disconnect');
    jest.advanceTimersByTime(10_000);

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('ROLL_PHASE');

    jest.advanceTimersByTime(50_000);
    expect(gameService.getGameSync(gameId)!.turnPhase).not.toBe('ROLL_PHASE');
  });

  it('waits for the final socket before beginning active-turn disconnect recovery', async () => {
    const firstSocket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const secondSocket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([firstSocket, secondSocket], gameId);
    const presence = new SocketPresence();
    presence.connect('db-player-1', firstSocket.id);
    presence.connect('db-player-1', secondSocket.id);
    registerGameHandlers(io, firstSocket, presence);
    registerGameHandlers(io, secondSocket, presence);

    await firstSocket.trigger('disconnect');
    expect(gameService.getGameSync(gameId)!.phaseDeadline).toBeUndefined();

    await secondSocket.trigger('disconnect');
    expect(gameService.getGameSync(gameId)!.phaseDeadline! - Date.now()).toBe(
      PHASE_TIMEOUTS.disconnectGrace
    );
  });

  it('restores the normal deadline when the active player reconnects', async () => {
    const socket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('disconnect');
    expect(gameService.getGameSync(gameId)!.phaseDeadline! - Date.now()).toBe(60_000);

    await socket.trigger('game:request-state', { gameId });

    expect(gameService.getGameSync(gameId)!.phaseDeadline! - Date.now()).toBe(45_000);
  });

  it('keeps the movement fallback when the active player disconnects mid-animation', async () => {
    const socket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:roll', { gameId });
    const movementDeadline = gameService.getGameSync(gameId)!.phaseDeadline;

    await socket.trigger('disconnect');

    expect(gameService.getGameSync(gameId)!.phaseDeadline).toBe(movementDeadline);
  });

  it('keeps a bail roll in MOVING until the presentation fallback resolves it', async () => {
    const state = makeGameState({ id: gameId, turnPhase: 'JAIL_DECISION' });
    state.players[0] = { ...state.players[0], isInJail: true };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:jail-bail', { gameId });
    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');

    jest.advanceTimersByTime(PHASE_TIMEOUTS.movementFallback);
    const advanced = gameService.getGameSync(gameId)!;
    expect(advanced.turnPhase).not.toBe('MOVING');

    await socket.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
    expect(gameService.getGameSync(gameId)).toBe(advanced);
  });

  it('keeps a successful jail escape roll in MOVING until one matching acknowledgement', async () => {
    const state = makeGameState({
      id: gameId,
      turnPhase: 'JAIL_CHALLENGE',
      currentChallenge: makePrivateChallenge({ context: 'JAIL_ESCAPE', startedAt: Date.now() }),
    });
    state.players[0] = { ...state.players[0], isInJail: true };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:jail-answer', { gameId, selectedIndex: 1, timeMs: 10 });
    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');

    await advanceOnceAfterAcknowledgement(socket, moving.diceRollId);
  });

  it('keeps an auto-release jail roll in MOVING until one matching acknowledgement', async () => {
    const state = makeGameState({ id: gameId, turnPhase: 'JAIL_DECISION' });
    state.players[0] = { ...state.players[0], isInJail: true, jailTurns: 1 };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:jail-wait', { gameId });
    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');

    await advanceOnceAfterAcknowledgement(socket, moving.diceRollId);
  });
});
