import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import { makeFinishedFixture } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

describe('finished-game reconnect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('restores public state and only the reconnecting learner report', async () => {
    const { state, scores, report } = makeFinishedFixture();
    gameService.replaceState(state.id, state);
    jest.spyOn(gameService, 'getScores').mockReturnValue(scores);
    jest.spyOn(gameService, 'getMasteryReports').mockReturnValue([report]);
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], state.id);
    registerGameHandlers(io, socket);

    await socket.trigger('game:request-state', { gameId: state.id });

    expect(socket.emit).toHaveBeenCalledWith('game:finished', {
      scores,
      masteryReport: report,
    });
  });
});
