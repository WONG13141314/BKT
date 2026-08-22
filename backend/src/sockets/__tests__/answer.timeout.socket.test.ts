import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

describe('expired socket answer inputs', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    gameService.removeGame('game_TEST');
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('uses server receipt time to timeout a correct card payload after the deadline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(21_000);
    const challenge = makePrivateChallenge({
      context: 'CHALLENGE_CARD', startedAt: 1_000, timeLimit: 20, correctIndex: 1,
    });
    const state = makeGameState({ turnPhase: 'CARD_MATH_CHALLENGE', currentChallenge: challenge });
    const before = state.players[0].masteryStates[challenge.skillName];
    gameService.replaceState(state.id, state);
    const socket = makeSocket({ player: { id: state.players[0].playerId } });
    const io = makeServer([socket], state.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:card-answer', { gameId: state.id, selectedIndex: challenge.correctIndex });

    expect(socket.emit).toHaveBeenCalledWith('game:answer-result', expect.objectContaining({
      result: expect.objectContaining({ timedOut: true, isCorrect: false }),
    }));
    expect(gameService.getGameSync(state.id)?.players[0].masteryStates[challenge.skillName]).toBe(before);
  });
});
