import { endTurn, initializeGameState, processCardChallengeAnswer } from '../game.engine';
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
      context: 'ROLL_CHALLENGE',
      consecutiveFailures: {},
    });

    gameService.replaceState(gameId, {
      ...state,
      turnPhase: 'ROLL_CHALLENGE',
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
    expect(outcome!.state.turnPhase).not.toBe('ROLL_CHALLENGE');
  });

  it('records a timeout without changing BKT mastery or the failure hint counter', () => {
    const state = gameService.getGameSync(gameId)!;
    const challenge = {
      ...selectChallenge({
        masteryStates: state.players[0].masteryStates,
        context: 'CHALLENGE_CARD' as const,
        consecutiveFailures: {},
      }),
      startedAt: 1_000,
    };
    const opened = {
      ...state,
      turnPhase: 'CARD_MATH_CHALLENGE' as const,
      currentChallenge: challenge,
    };
    const before = opened.players[0].masteryStates[challenge.skillName];

    const outcome = processCardChallengeAnswer(opened, null as unknown as number, 26_000);

    expect(outcome.result.timedOut).toBe(true);
    expect(outcome.result.previousMastery).toBe(before);
    expect(outcome.result.newMastery).toBe(before);
    expect(outcome.newState.players[0].consecutiveFailures[challenge.skillName]).toBe(0);
    expect(outcome.newState.players[0].totalQuestions).toBe(opened.players[0].totalQuestions + 1);
    expect(outcome.newState.players[0].streak).toBe(0);
    expect(outcome.result.reward.type).toBe('NONE');
    expect(outcome.newState.players[0].money).toBe(opened.players[0].money);
  });

  it('settles an abandoned duel at full rent', () => {
    const state = gameService.getGameSync(gameId)!;
    const duelSide = (playerId: string) => ({
      playerId,
      challenge: {
        ...selectChallenge({
        masteryStates: state.players[0].masteryStates,
        context: 'MATH_DUEL' as const,
        consecutiveFailures: {},
        forceSkill: 'Addition' as const,
        }),
        startedAt: Date.now() - 60_000,
      },
      selectedIndex: null,
      isCorrect: null,
      timeMs: null,
      previousMastery: null,
      newMastery: null,
    });

    gameService.replaceState(gameId, {
      ...state,
      turnPhase: 'MATH_DUEL',
      currentPlayerIndex: 0,
      duelState: {
        tileIndex: 1,
        tileName: 'Tambah Alley',
        rentAmount: 20,
        challenger: duelSide('p1'),
        owner: duelSide('p2'),
        startedAt: Date.now() - 60_000,
        resolution: null,
      },
    });

    const outcome = gameService.resolveStalledTurn(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.state.turnPhase).toBe('END_TURN');

    // Neither side answered → neither wins → rent stands. Walking away must not
    // be a way to dodge it, and must not cost more than it would have.
    expect(outcome!.state.duelState!.resolution!.outcome).toBe('DRAW_NEITHER');
    expect(outcome!.state.players[0].money).toBe(state.players[0].money - 20);
    // No landlord bonus: the owner did not answer either.
    expect(outcome!.state.players[1].money).toBe(state.players[1].money + 20);
  });

  it('advances MOVING when the presentation fallback expires', () => {
    const state = gameService.startRoll(gameId)!;

    expect(state.turnPhase).toBe('MOVING');
    const outcome = gameService.resolveStalledTurn(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.state.turnPhase).not.toBe('MOVING');
  });

  it('returns null for an unknown game', () => {
    expect(gameService.resolveStalledTurn('no-such-game')).toBeNull();
  });
});
