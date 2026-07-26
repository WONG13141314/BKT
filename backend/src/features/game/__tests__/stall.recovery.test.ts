import { endTurn, initializeGameState } from '../game.engine';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { gameService } from '../game.service';
import { GameState } from '../game.types';
import { CLOCK_CAP_MINUTES } from '../game.constants';

const PLAYERS = [
  { id: 'p1', playerId: 'u1', name: 'Alice', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'u2', name: 'Bob', color: '#f59e0b', order: 1 },
  { id: 'p3', playerId: 'u3', name: 'Carol', color: '#10b981', order: 2 },
];

describe('Clock cap', () => {
  let state: GameState;

  beforeEach(() => {
    state = initializeGameState('clock-test', PLAYERS);
  });

  it('flags the final round without stranding the current player', () => {
    // Wall-clock cap reached while the first player is ending their turn.
    const stale: GameState = {
      ...state,
      turnPhase: 'END_TURN',
      currentPlayerIndex: 0,
      gameStartTime: Date.now() - (CLOCK_CAP_MINUTES + 1) * 60_000,
    };

    const next = endTurn(stale);

    expect(next.isFinalRound).toBe(true);
    // The bug this covers: endTurn used to return early on the clock cap, so
    // currentPlayerIndex never moved and the player was stuck in END_TURN.
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.turnPhase).toBe('ROLL_PHASE');
    expect(next.phase).toBe('PLAYING');
  });

  it('finishes once the last active player has taken their final-round turn', () => {
    const lastTurn: GameState = {
      ...state,
      turnPhase: 'END_TURN',
      isFinalRound: true,
      currentPlayerIndex: PLAYERS.length - 1,
    };

    expect(endTurn(lastTurn).phase).toBe('FINISHED');
  });
});

describe('resolveStalledTurn', () => {
  const gameId = 'stall-test';

  beforeEach(async () => {
    gameService.removeGame(gameId);
    await gameService.createGame(gameId, PLAYERS);
  });

  afterEach(() => {
    gameService.removeGame(gameId);
  });

  it('grades an unanswered challenge as incorrect and marks it timed out', () => {
    const state = gameService.getGameSync(gameId)!;
    const challenge = selectChallenge({
      masteryStates: state.players[0].masteryStates,
      context: 'DICE_CHALLENGE',
      consecutiveFailures: {},
      diceValues: [3, 4],
    });

    gameService.replaceState(gameId, {
      ...state,
      turnPhase: 'DICE_CHALLENGE',
      currentPlayerIndex: 0,
      currentChallenge: challenge,
    });

    const before = state.players[0];
    const outcome = gameService.resolveStalledTurn(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.result).not.toBeNull();
    expect(outcome!.result!.isCorrect).toBe(false);
    expect(outcome!.result!.timedOut).toBe(true);

    // The attempt still counts — a timeout is evidence, not a skipped question.
    const after = outcome!.state.players[outcome!.state.currentPlayerIndex];
    expect(after.totalQuestions).toBe(before.totalQuestions + 1);
    expect(after.totalCorrect).toBe(before.totalCorrect);

    // And the turn is no longer blocked.
    expect(outcome!.state.turnPhase).not.toBe('DICE_CHALLENGE');
  });

  it('takes the cheapest option when a decision is abandoned', () => {
    const state = gameService.getGameSync(gameId)!;
    const withRentDue: GameState = {
      ...state,
      turnPhase: 'RENT_PAYMENT',
      currentPlayerIndex: 0,
      pendingTileEvent: {
        type: 'PROPERTY',
        tileIndex: 1,
        tileName: 'Tambah Alley',
        propertyOwner: 'p2',
        rentAmount: 20,
      },
    };
    gameService.replaceState(gameId, withRentDue);

    const outcome = gameService.resolveStalledTurn(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.result).toBeNull();
    expect(outcome!.state.turnPhase).toBe('END_TURN');
    // Rent still transfers — abandoning a turn must not be a way to dodge it.
    expect(outcome!.state.players[0].money).toBe(state.players[0].money - 20);
    expect(outcome!.state.players[1].money).toBe(state.players[1].money + 20);
  });

  it('does nothing for server-driven phases', () => {
    const state = gameService.getGameSync(gameId)!;
    gameService.replaceState(gameId, { ...state, turnPhase: 'MOVING' });

    expect(gameService.resolveStalledTurn(gameId)).toBeNull();
  });

  it('returns null for an unknown game', () => {
    expect(gameService.resolveStalledTurn('no-such-game')).toBeNull();
  });
});
