import type { Server } from 'socket.io';
import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import {
  getPhaseDeadline,
  PhaseTimerRegistry,
} from '../phase.deadlines';
import { makeGameState } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

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

  it('restores the normal deadline when the active player reconnects', async () => {
    const socket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('disconnect');
    expect(gameService.getGameSync(gameId)!.phaseDeadline! - Date.now()).toBe(60_000);

    await socket.trigger('game:request-state', { gameId });

    expect(gameService.getGameSync(gameId)!.phaseDeadline! - Date.now()).toBe(45_000);
  });
});
