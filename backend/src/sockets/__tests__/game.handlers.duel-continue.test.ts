import { gameService } from '../../test/game.service';
import type { GameState } from '../../features/game/game.types';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { registerGameHandlers } from '../../test/socket.runtime';
import { makeServer, makeSocket } from './socket.harness';

const DUEL_ID = 'challenger-question:owner-question';

function makeResolvedDuelState(overrides: Partial<GameState> = {}): GameState {
  const state = makeGameState({ turnPhase: 'END_TURN' });
  return {
    ...state,
    duelState: {
      tileIndex: 1,
      tileName: 'Tambah Town',
      rentAmount: 50,
      startedAt: 1_000,
      challenger: {
        playerId: state.players[0].id,
        challenge: makePrivateChallenge({ id: 'challenger-question', context: 'MATH_DUEL' }),
        selectedIndex: 1,
        isCorrect: true,
        timeMs: 500,
        previousMastery: 0.3,
        newMastery: 0.5,
      },
      owner: {
        playerId: state.players[1].id,
        challenge: makePrivateChallenge({ id: 'owner-question', context: 'MATH_DUEL' }),
        selectedIndex: 0,
        isCorrect: false,
        timeMs: 600,
        previousMastery: 0.3,
        newMastery: 0.2,
      },
      resolution: {
        outcome: 'CHALLENGER_WINS',
        rentPaid: 0,
        landlordBonus: 0,
        challengerCorrect: true,
        ownerCorrect: false,
        headline: 'Rent avoided!',
      },
    },
    ...overrides,
  };
}

describe('shared duel reveal dismissal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    gameService.removeGame('game_TEST');
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('dismisses the reveal for the whole room when the active human continues, preserving their turn and deadline', async () => {
    const deadline = Date.now() + 8_000;
    const state = gameService.replaceState('game_TEST', makeResolvedDuelState({
      phaseDeadline: deadline,
      phaseDeadlineFor: 'END_TURN',
    }));
    const active = makeSocket({ player: { id: state.players[0].playerId } });
    const owner = makeSocket({ player: { id: state.players[1].playerId } });
    const observer = makeSocket({ player: { id: 'observer' } });
    const io = makeServer([active, owner, observer]);
    const endTurn = jest.spyOn(gameService, 'endTurn');
    registerGameHandlers(io, active);

    await active.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });

    expect(io.to).toHaveBeenCalledWith('room:TEST');
    expect(io.roomEmitter.emit.mock.calls.map(([event]) => event)).toEqual([
      'game:duel-dismissed', 'game:state',
    ]);
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:duel-dismissed', { duelId: DUEL_ID });
    expect(gameService.getGameSync(state.id)).toEqual({ ...state, duelState: null });
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:state', {
      state: expect.objectContaining({ currentPlayerIndex: 0, turnPhase: 'END_TURN', phaseDeadline: deadline }),
    });
    expect(endTurn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(8_000);
    expect(endTurn).toHaveBeenCalledWith(state.id);
    expect(gameService.getGameSync(state.id)?.currentPlayerIndex).toBe(1);
  });

  it.each(['db-player-2', 'observer', 'seat-1'])(
    'ignores %s even when the payload claims the active player identity', async (accountId) => {
      const state = gameService.replaceState('game_TEST', makeResolvedDuelState());
      const socket = makeSocket({ player: { id: accountId } });
      const io = makeServer([socket]);
      registerGameHandlers(io, socket);

      await socket.trigger('game:duel-continue', {
        gameId: state.id, duelId: DUEL_ID, playerId: state.players[0].playerId, seatId: state.players[0].id,
      });

      expect(gameService.getGameSync(state.id)).toBe(state);
      expect(io.roomEmitter.emit).not.toHaveBeenCalled();
    }
  );

  it('rejects a socket authenticated as the active bot', async () => {
    const fixture = makeResolvedDuelState();
    fixture.players[0] = { ...fixture.players[0], isBot: true };
    const state = gameService.replaceState(fixture.id, fixture);
    const socket = makeSocket({ player: { id: state.players[0].playerId } });
    const io = makeServer([socket]);
    registerGameHandlers(io, socket);

    await socket.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });

    expect(gameService.getGameSync(state.id)).toBe(state);
    expect(io.roomEmitter.emit).not.toHaveBeenCalled();
  });

  it('requires the active account socket to have joined the game room', async () => {
    const state = gameService.replaceState('game_TEST', makeResolvedDuelState());
    const socket = makeSocket({ player: { id: state.players[0].playerId } });
    const io = makeServer([]);
    registerGameHandlers(io, socket);

    await socket.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });

    expect(gameService.getGameSync(state.id)).toBe(state);
    expect(io.roomEmitter.emit).not.toHaveBeenCalled();
  });

  it('ignores stale encounter ids and duplicate Continue events', async () => {
    const state = gameService.replaceState('game_TEST', makeResolvedDuelState());
    const socket = makeSocket({ player: { id: state.players[0].playerId } });
    const io = makeServer([socket]);
    registerGameHandlers(io, socket);

    await socket.trigger('game:duel-continue', { gameId: state.id, duelId: 'previous:duel' });
    expect(gameService.getGameSync(state.id)).toBe(state);
    expect(io.roomEmitter.emit).not.toHaveBeenCalled();

    await socket.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });
    const continued = gameService.getGameSync(state.id);
    await socket.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });

    expect(gameService.getGameSync(state.id)).toBe(continued);
    expect(io.roomEmitter.emit.mock.calls.filter(([event]) => event === 'game:duel-dismissed')).toHaveLength(1);
  });

  it.each(['unresolved duel', 'wrong turn phase', 'finished game'])(
    'leaves an %s untouched', async (scenario) => {
      const fixture = makeResolvedDuelState();
      if (scenario === 'unresolved duel') fixture.duelState!.resolution = null;
      if (scenario === 'wrong turn phase') fixture.turnPhase = 'MATH_DUEL';
      if (scenario === 'finished game') fixture.phase = 'FINISHED';
      const state = gameService.replaceState(fixture.id, fixture);
      const socket = makeSocket({ player: { id: state.players[0].playerId } });
      const io = makeServer([socket]);
      registerGameHandlers(io, socket);

      await socket.trigger('game:duel-continue', { gameId: state.id, duelId: DUEL_ID });

      expect(gameService.getGameSync(state.id)).toBe(state);
      expect(io.roomEmitter.emit).not.toHaveBeenCalled();
    }
  );

  it('ignores malformed requests without throwing or changing the reveal', async () => {
    const state = gameService.replaceState('game_TEST', makeResolvedDuelState());
    const socket = makeSocket({ player: { id: state.players[0].playerId } });
    const io = makeServer([socket]);
    registerGameHandlers(io, socket);

    for (const payload of [null, undefined, [], {}, { gameId: state.id, duelId: 1 }]) {
      await socket.trigger('game:duel-continue', payload);
    }

    expect(gameService.getGameSync(state.id)).toBe(state);
    expect(io.roomEmitter.emit).not.toHaveBeenCalled();
  });
});
