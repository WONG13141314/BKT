import { gameService } from '../../test/game.service';
import { registerGameHandlers } from '../../test/socket.runtime';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';
import type { DuelSide } from '../../features/game/game.types';

describe('authenticated private hint requests', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(2_000));
  afterEach(() => {
    gameService.removeGame('game_TEST');
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('acknowledges and refreshes only the requesting learner, including reconnection', async () => {
    const state = makeGameState({ turnPhase: 'CARD_MATH_CHALLENGE', currentChallenge: makePrivateChallenge() });
    gameService.replaceState(state.id, state);
    const learner = makeSocket({ player: { id: state.players[0].playerId }, gameId: state.id });
    const observer = makeSocket({ player: { id: state.players[1].playerId }, gameId: state.id });
    const io = makeServer([learner, observer], state.id);
    registerGameHandlers(io, learner);
    const acknowledgement = jest.fn();
    await learner.trigger('game:request-hint', { gameId: state.id, challengeId: 'challenge-1' }, acknowledgement);
    expect(acknowledgement).toHaveBeenCalledWith({ success: true });
    expect(learner.emit).toHaveBeenCalledWith('game:challenge', {
      playerId: state.players[0].id,
      challenge: expect.objectContaining({ hint: expect.objectContaining({ content: expect.any(String) }) }),
    });
    expect(observer.emit).not.toHaveBeenCalled();
    expect(io.roomEmitter.emit).not.toHaveBeenCalled();
    expect(gameService.getGameSync(state.id)!.currentChallenge!.hintRequestedAt).toBe(2_000);

    const reconnected = makeSocket({ player: { id: state.players[0].playerId }, gameId: state.id });
    registerGameHandlers(io, reconnected);
    await reconnected.trigger('game:request-challenge', { gameId: state.id });
    expect(reconnected.emit).toHaveBeenCalledWith('game:challenge', expect.objectContaining({
      challenge: expect.objectContaining({ hint: expect.objectContaining({ content: expect.any(String) }) }),
    }));
  });

  it.each([
    ['outsider', 'game_TEST', { gameId: 'game_TEST', challengeId: 'challenge-1' }],
    ['seat-1', 'game_TEST', { gameId: 'game_TEST', challengeId: 'challenge-1' }],
    ['db-player-2', 'game_TEST', { gameId: 'game_TEST', challengeId: 'challenge-1' }],
    ['db-player-1', 'game_OTHER', { gameId: 'game_TEST', challengeId: 'challenge-1' }],
    ['db-player-1', 'game_TEST', { gameId: 'game_TEST', challengeId: 'stale-question' }],
    ['db-player-1', 'game_TEST', null],
  ])('rejects invalid account/session/target request %#', async (account, boundGame, payload) => {
    const state = makeGameState({ turnPhase: 'CARD_MATH_CHALLENGE', currentChallenge: makePrivateChallenge() });
    gameService.replaceState(state.id, state);
    const socket = makeSocket({ player: { id: account }, gameId: boundGame });
    registerGameHandlers(makeServer([socket], state.id), socket);
    const acknowledgement = jest.fn();
    await socket.trigger('game:request-hint', payload, acknowledgement);
    expect(acknowledgement).toHaveBeenCalledWith({ success: false, error: expect.any(String) });
    expect(socket.emit).not.toHaveBeenCalledWith('game:challenge', expect.anything());
    expect(gameService.getGameSync(state.id)!.currentChallenge).not.toHaveProperty('hintRequestedAt');
  });

  it('rejects a request at the deadline without adding time or marking assistance', async () => {
    const state = makeGameState({ turnPhase: 'CARD_MATH_CHALLENGE', currentChallenge: makePrivateChallenge() });
    gameService.replaceState(state.id, state);
    jest.setSystemTime(21_000);
    const socket = makeSocket({ player: { id: state.players[0].playerId }, gameId: state.id });
    registerGameHandlers(makeServer([socket], state.id), socket);
    const acknowledgement = jest.fn();
    await socket.trigger('game:request-hint', { gameId: state.id, challengeId: 'challenge-1' }, acknowledgement);
    expect(acknowledgement).toHaveBeenCalledWith({ success: false, error: expect.any(String) });
    expect(gameService.getGameSync(state.id)!.currentChallenge).toEqual(state.currentChallenge);
  });

  it('lets the owner request a private hint on the challenger turn and restores it after reconnect', async () => {
    const state = makeGameState({ turnPhase: 'MATH_DUEL' });
    const side = (index: number): DuelSide => ({ playerId: state.players[index].id,
      challenge: makePrivateChallenge({ id: `duel-${index}`, context: 'MATH_DUEL' }),
      selectedIndex: null, isCorrect: null, timeMs: null, previousMastery: null, newMastery: null });
    state.duelState = { tileIndex: 1, tileName: 'Test deed', rentAmount: 50,
      challenger: side(0), owner: side(1), startedAt: 1_000, resolution: null };
    gameService.replaceState(state.id, state);
    const challenger = makeSocket({ player: { id: state.players[0].playerId }, gameId: state.id });
    const owner = makeSocket({ player: { id: state.players[1].playerId }, gameId: state.id });
    const io = makeServer([challenger, owner], state.id);
    registerGameHandlers(io, owner);
    const acknowledgement = jest.fn();
    await owner.trigger('game:request-hint', { gameId: state.id, challengeId: 'duel-1' }, acknowledgement);
    expect(acknowledgement).toHaveBeenCalledWith({ success: true });
    expect(owner.emit).toHaveBeenCalledWith('game:challenge', expect.objectContaining({
      challenge: expect.objectContaining({ id: 'duel-1', hint: expect.any(Object) }),
    }));
    expect(challenger.emit).not.toHaveBeenCalled();
    expect(gameService.getGameSync(state.id)!.duelState!.challenger.challenge).not.toHaveProperty('hintRequestedAt');
    await owner.trigger('game:request-challenge', { gameId: state.id });
    expect(owner.emit).toHaveBeenCalledWith('game:duel', expect.objectContaining({
      myChallenge: expect.objectContaining({ id: 'duel-1', hint: expect.any(Object) }),
    }));
  });
});
