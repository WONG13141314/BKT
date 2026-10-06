import {
  processCardChallengeAnswer, processJailEscapeAnswer, processSmartBuyAnswer,
  requestChallengeHint, resolveDuel, submitDuelAnswer,
} from '../game.engine';
import { makeGameState, makePrivateChallenge } from '../../../test/game.fixtures';
import type { DuelSide, GameState, TurnPhase } from '../game.types';

function soloState(phase: TurnPhase = 'CARD_MATH_CHALLENGE'): GameState {
  const state = makeGameState({ turnPhase: phase, currentChallenge: makePrivateChallenge() });
  state.players[0] = { ...state.players[0],
    consecutiveFailures: { ...state.players[0].consecutiveFailures, Addition: 2 },
    isInJail: phase === 'JAIL_CHALLENGE',
  };
  state.pendingTileEvent = { type: 'PROPERTY', tileIndex: 1, tileName: 'Test deed', propertyPrice: 100 };
  return state;
}

function duelState(): GameState {
  const state = makeGameState({ turnPhase: 'MATH_DUEL' });
  const side = (index: number): DuelSide => ({ playerId: state.players[index].id,
    challenge: makePrivateChallenge({ id: `duel-${index}`, context: 'MATH_DUEL' }),
    selectedIndex: null, isCorrect: null, timeMs: null, previousMastery: null, newMastery: null });
  return { ...state, duelState: { tileIndex: 1, tileName: 'Test deed', rentAmount: 50,
    challenger: side(0), owner: side(1), startedAt: 1_000, resolution: null } };
}

describe('private hint lifecycle and BKT evidence', () => {
  it('records one idempotent request while preserving its original deadline and input state', () => {
    const state = soloState();
    const first = requestChallengeHint(state, state.players[0].id, 'challenge-1', 1_500)!;
    const repeated = requestChallengeHint(first.newState, state.players[0].id, 'challenge-1', 2_000)!;
    expect(first.challenge.hintRequestedAt).toBe(1_500);
    expect(repeated.newState).toBe(first.newState);
    expect(repeated.challenge.hintRequestedAt).toBe(1_500);
    expect(first.challenge.startedAt).toBe(state.currentChallenge!.startedAt);
    expect(first.challenge.timeLimit).toBe(state.currentChallenge!.timeLimit);
    expect(state.currentChallenge).not.toHaveProperty('hintRequestedAt');
  });

  it('rejects expired, stale, other-seat, completed and bot requests', () => {
    const state = soloState();
    expect(requestChallengeHint(state, state.players[0].id, 'challenge-1', 21_000)).toBeNull();
    expect(requestChallengeHint(state, state.players[0].id, 'old-question', 1_500)).toBeNull();
    expect(requestChallengeHint(state, state.players[1].id, 'challenge-1', 1_500)).toBeNull();
    expect(requestChallengeHint({ ...state, turnPhase: 'END_TURN' }, state.players[0].id, 'challenge-1', 1_500)).toBeNull();
    expect(requestChallengeHint({ ...state, phase: 'FINISHED' }, state.players[0].id, 'challenge-1', 1_500)).toBeNull();
    const bot = { ...state, players: [{ ...state.players[0], isBot: true }, state.players[1]] };
    expect(requestChallengeHint(bot, bot.players[0].id, 'challenge-1', 1_500)).toBeNull();
  });

  it.each([
    ['CARD_MATH_CHALLENGE', processCardChallengeAnswer],
    ['SMART_BUY_CHALLENGE', processSmartBuyAnswer],
    ['JAIL_CHALLENGE', processJailEscapeAnswer],
  ] as const)('keeps normal rewards while excluding assisted evidence in %s', (phase, process) => {
    for (const correct of [true, false]) {
      const state = soloState(phase);
      const selected = correct ? state.currentChallenge!.correctIndex : 0;
      const hinted = requestChallengeHint(state, state.players[0].id, 'challenge-1', 1_500)!.newState;
      const assisted = process(hinted, selected, 2_000);
      const independent = process(state, selected, 2_000);
      const before = state.players[0];
      const after = assisted.newState.players[0];
      expect(assisted.result.assisted).toBe(true);
      expect(independent.result.assisted).toBe(false);
      expect(assisted.result.isCorrect).toBe(correct);
      expect(assisted.result.reward).toEqual(independent.result.reward);
      expect(after.money).toBe(independent.newState.players[0].money);
      expect(after.streak).toBe(independent.newState.players[0].streak);
      expect(after.totalCorrect).toBe(before.totalCorrect + (correct ? 1 : 0));
      expect(after.totalQuestions).toBe(before.totalQuestions + 1);
      expect(after.masteryStates).toEqual(before.masteryStates);
      expect(after.skillAttempts).toEqual(before.skillAttempts);
      expect(after.consecutiveFailures).toEqual(before.consecutiveFailures);
    }
  });

  it('keeps duel requests and evidence separate for each player', () => {
    const state = duelState();
    const hinted = requestChallengeHint(state, state.players[1].id, 'duel-1', 1_500)!.newState;
    expect(hinted.duelState!.challenger.challenge).not.toHaveProperty('hintRequestedAt');
    expect(requestChallengeHint(hinted, state.players[0].id, 'duel-1', 1_600)).toBeNull();
    const challengerAnswered = submitDuelAnswer(hinted, state.players[0].id, 1, 2_000);
    expect(requestChallengeHint(challengerAnswered, state.players[0].id, 'duel-0', 2_100)).toBeNull();
    const both = submitDuelAnswer(challengerAnswered, state.players[1].id, 1, 2_500);
    const settled = resolveDuel(both);
    expect(settled.resolution.outcome).toBe('DRAW_BOTH');
    expect(settled.newState.players[0].skillAttempts.Addition).toBe(state.players[0].skillAttempts.Addition + 1);
    expect(settled.newState.players[1].masteryStates).toEqual(state.players[1].masteryStates);
    expect(settled.newState.players[1].skillAttempts).toEqual(state.players[1].skillAttempts);
    expect(settled.duel.owner.newMastery).toBe(settled.duel.owner.previousMastery);
  });

  it.each([true, false])('preserves duel money outcomes for an assisted response correct=%s', (correct) => {
    const state = duelState();
    const hinted = requestChallengeHint(state, state.players[1].id, 'duel-1', 1_500)!.newState;
    const settle = (input: GameState) => resolveDuel(submitDuelAnswer(
      submitDuelAnswer(input, state.players[0].id, 1, 2_000),
      state.players[1].id, correct ? 1 : 0, 2_500
    ));
    const assisted = settle(hinted);
    const independent = settle(state);
    expect(assisted.resolution).toEqual(independent.resolution);
    expect(assisted.newState.players.map((player) => player.money)).toEqual(
      independent.newState.players.map((player) => player.money)
    );
    expect(assisted.newState.players[1].masteryStates).toEqual(state.players[1].masteryStates);
    expect(assisted.newState.players[1].skillAttempts).toEqual(state.players[1].skillAttempts);
    expect(assisted.newState.players[1].consecutiveFailures).toEqual(state.players[1].consecutiveFailures);
  });
});
