import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

describe('duel answer feedback privacy', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    gameService.removeGame('game_TEST');
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends worked feedback and the correct answer only to the human duellist who submitted', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const challengerQuestion = makePrivateChallenge({
      id: 'challenger-question', context: 'MATH_DUEL', startedAt: 1_000, correctIndex: 1,
    });
    const ownerQuestion = makePrivateChallenge({
      id: 'owner-question', context: 'MATH_DUEL', startedAt: 1_000, correctIndex: 2,
    });
    const state = makeGameState({ turnPhase: 'MATH_DUEL' });
    state.duelState = {
      tileIndex: 1,
      tileName: 'Tambah Alley',
      rentAmount: 50,
      challenger: {
        playerId: state.players[0].id,
        challenge: challengerQuestion,
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      owner: {
        playerId: state.players[1].id,
        challenge: ownerQuestion,
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      startedAt: 1_000,
      resolution: null,
    };
    gameService.replaceState(state.id, state);

    const challengerSocket = makeSocket({ player: { id: state.players[0].playerId } });
    const ownerSocket = makeSocket({ player: { id: state.players[1].playerId } });
    const observerSocket = makeSocket({ player: { id: 'db-observer' } });
    const io = makeServer([challengerSocket, ownerSocket, observerSocket], state.id);
    registerGameHandlers(io, challengerSocket);

    await challengerSocket.trigger('game:duel-answer', {
      gameId: state.id,
      selectedIndex: challengerQuestion.correctIndex,
    });

    expect(challengerSocket.emit).toHaveBeenCalledWith('game:answer-result', expect.objectContaining({
      playerId: state.players[0].id,
      result: expect.objectContaining({
        isCorrect: true,
        correctAnswer: challengerQuestion.options[challengerQuestion.correctIndex],
        feedback: expect.stringContaining('Addition:'),
      }),
    }));
    expect(ownerSocket.emit).not.toHaveBeenCalledWith('game:answer-result', expect.anything());
    expect(observerSocket.emit).not.toHaveBeenCalledWith('game:answer-result', expect.anything());
    const sharedDuelResults = io.roomEmitter.emit.mock.calls
      .filter(([event]) => event === 'game:duel-result');
    expect(JSON.stringify(sharedDuelResults)).not.toContain(challengerQuestion.options[challengerQuestion.correctIndex]);
    expect(JSON.stringify(sharedDuelResults)).not.toContain('feedback');
  });
});
