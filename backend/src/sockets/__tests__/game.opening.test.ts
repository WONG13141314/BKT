import { gameService } from '../../test/game.service';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { publishGameStartTransition, registerGameHandlers } from '../../test/socket.runtime';
import { PHASE_TIMEOUTS } from '../phase.deadlines';
import { makeServer, makeSocket } from './socket.harness';

const gameId = 'game_TEST';
const NOW = 1_700_000_000_000;

describe('game opening: the first turn waits for the boards', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    gameService.removeGame(gameId);
  });

  /** Seat 1 is a bot that goes first; seat 2 is the learner on this socket. */
  function botFirstTable() {
    const state = makeGameState({ id: gameId });
    state.players[0] = { ...state.players[0], isBot: true };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-2' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);
    publishGameStartTransition(io, state);
    return { socket, io };
  }

  it('holds the first bot roll until the learner board is ready, then shows the banner', async () => {
    const { socket } = botFirstTable();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(gameService.getGameSync(gameId)).toMatchObject({ diceRollId: 0, phaseDeadline: null });

    await socket.trigger('game:board-ready', { gameId });
    expect(gameService.getGameSync(gameId)!.opening?.beginsAt).toBe(NOW + 5_000 + PHASE_TIMEOUTS.openingBanner);
    await jest.advanceTimersByTimeAsync(PHASE_TIMEOUTS.openingBanner);
    expect(gameService.getGameSync(gameId)).toMatchObject({ opening: null, diceRollId: 0 });

    await jest.advanceTimersByTimeAsync(800);
    expect(gameService.getGameSync(gameId)!.diceRollId).toBe(1);
  });

  it('starts after the wait cap when a learner never reports ready', async () => {
    botFirstTable();
    await jest.advanceTimersByTimeAsync(PHASE_TIMEOUTS.openingWait - 1);
    expect(gameService.getGameSync(gameId)!.opening?.beginsAt).toBeNull();
    await jest.advanceTimersByTimeAsync(1 + PHASE_TIMEOUTS.openingBanner + 800);
    expect(gameService.getGameSync(gameId)).toMatchObject({ opening: null, diceRollId: 1 });
  });

  it('ignores the first player rolling before the opening ends, and a repeated start', async () => {
    const state = makeGameState({ id: gameId });
    gameService.replaceState(gameId, state);
    const first = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const second = makeSocket({ player: { id: 'db-player-2' }, gameId });
    const io = makeServer([first, second], gameId);
    registerGameHandlers(io, first);
    registerGameHandlers(io, second);
    publishGameStartTransition(io, state);

    await first.trigger('game:board-ready', { gameId });
    await first.trigger('game:roll', { gameId });
    expect(gameService.getGameSync(gameId)!.diceRollId).toBe(0);
    // One of two boards is ready, so the table still waits for the other.
    expect(gameService.getGameSync(gameId)!.opening).toMatchObject({ readyPlayerIds: ['db-player-1'], beginsAt: null });
    publishGameStartTransition(io, state);
    expect(gameService.getGameSync(gameId)!.opening?.readyPlayerIds).toEqual(['db-player-1']);

    await second.trigger('game:board-ready', { gameId });
    await jest.advanceTimersByTimeAsync(PHASE_TIMEOUTS.openingBanner);
    await first.trigger('game:roll', { gameId });
    expect(gameService.getGameSync(gameId)!.diceRollId).toBe(1);
  });

  it('does not wait for a learner whose seat a bot is playing', async () => {
    const state = makeGameState({ id: gameId });
    state.players[1] = { ...state.players[1], autopilot: true };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);
    publishGameStartTransition(io, state);
    await socket.trigger('game:board-ready', { gameId });
    expect(gameService.getGameSync(gameId)!.opening?.beginsAt).not.toBeNull();
  });
});

describe('End Turn after an answer card', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    gameService.removeGame(gameId);
  });

  it('opens the End Turn window only after the answer card has had its time', async () => {
    const state = makeGameState({
      id: gameId,
      turnPhase: 'JAIL_CHALLENGE',
      currentChallenge: makePrivateChallenge({ context: 'JAIL_ESCAPE', startedAt: NOW }),
    });
    state.players[0] = { ...state.players[0], isInJail: true };
    gameService.replaceState(gameId, state);
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:jail-answer', { gameId, selectedIndex: 0 });
    const ended = gameService.getGameSync(gameId)!;
    expect(ended.turnPhase).toBe('END_TURN');
    expect(ended.phaseDeadline! - NOW).toBe(PHASE_TIMEOUTS.answerReview + PHASE_TIMEOUTS.endTurn);
  });
});
