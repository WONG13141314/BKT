import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

describe('game socket account identity', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not let a matching seat id submit an answer against another account learning record', async () => {
    const state = makeGameState({
      turnPhase: 'ROLL_CHALLENGE',
      currentChallenge: makePrivateChallenge({ context: 'ROLL_CHALLENGE' }),
    });
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    gameService.replaceState(state.id, state);
    const submitAnswer = jest.spyOn(gameService, 'submitRollChallengeAnswer');
    const socket = makeSocket({ player: { id: 'alice' } });
    const io = makeServer([socket], state.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:roll-answer', { gameId: state.id, selectedIndex: 0, timeMs: 10 });

    expect(submitAnswer).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('game:error', { message: 'Not your turn' });
  });

  it('does not publish state or challenge data to an outsider requesting a challenge', async () => {
    const state = makeGameState({ currentChallenge: makePrivateChallenge() });
    gameService.replaceState(state.id, state);
    const socket = makeSocket({ player: { id: 'outsider' } });
    const io = makeServer([socket], state.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:request-challenge', { gameId: state.id });

    expect(socket.emit).not.toHaveBeenCalledWith('game:state', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('game:challenge', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('game:challenge-started', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('game:duel', expect.anything());
  });

  it('does not reconnect an account that matches only another player seat id', async () => {
    const state = makeGameState();
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    gameService.replaceState(state.id, state);
    const socket = makeSocket({ player: { id: 'alice' } });
    const io = makeServer([socket], state.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:request-state', { gameId: state.id });

    expect(socket.emit).toHaveBeenCalledWith('game:seat-mismatch', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('game:state', expect.anything());
  });
});
