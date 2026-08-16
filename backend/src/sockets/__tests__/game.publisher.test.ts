import { toPublicGameState } from '../../features/game/game.public';
import { publishFinishedToSocket } from '../game.publisher';
import { makeFinishedFixture, makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeSocket } from './socket.harness';

describe('game publisher', () => {
  it('projects only public player and game fields', () => {
    const state = makeGameState();
    state.players[0].masteryStates = { Addition: 0.91 };
    state.players[0].skillAttempts = { Addition: 8 };
    state.players[0].consecutiveFailures = { Addition: 2 };
    state.currentChallenge = makePrivateChallenge({ correctIndex: 2 });

    const publicState = toPublicGameState(state);

    expect(publicState.players[0]).not.toHaveProperty('masteryStates');
    expect(publicState.players[0]).not.toHaveProperty('skillAttempts');
    expect(publicState.players[0]).not.toHaveProperty('consecutiveFailures');
    expect(publicState).not.toHaveProperty('currentChallenge');
    expect(JSON.stringify(publicState)).not.toContain('correctIndex');
  });

  it('sends only the requesting learner report in a finished payload', () => {
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const { state, scores, report } = makeFinishedFixture();

    publishFinishedToSocket(socket, state, scores, report);

    expect(socket.emit).toHaveBeenCalledWith('game:finished', {
      scores,
      masteryReport: report,
    });
  });
});
