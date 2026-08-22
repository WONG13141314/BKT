import { selectChallenge } from '../../../bkt/bkt.selector';
import { initializeGameState } from '../game.engine';
import { gameService } from '../game.service';
import type { AnswerResult, GameState, TurnPhase } from '../game.types';

const PLAYERS = [
  { id: 'p1', playerId: 'db-alice', name: 'Alice', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'db-bob', name: 'Bob', color: '#f59e0b', order: 1 },
];

type SoloCase = {
  name: string;
  phase: TurnPhase;
  context: 'SMART_BUY' | 'CHALLENGE_CARD' | 'JAIL_ESCAPE';
  submit: (gameId: string, selectedIndex: number | null, receivedAt: number) => { state: GameState; result: AnswerResult } | null;
};

function openChallenge(phase: SoloCase['phase'], context: SoloCase['context']): GameState {
  const state = initializeGameState('game_TIMEOUT', PLAYERS);
  const challenge = {
    ...selectChallenge({
      masteryStates: state.players[0].masteryStates,
      consecutiveFailures: state.players[0].consecutiveFailures,
      context,
      propertyPrice: 100,
    }),
    startedAt: 1_000,
    timeLimit: 20,
  };
  const propertyEvent = {
    type: 'PROPERTY' as const,
    tileIndex: 1,
    tileName: 'Tambah Alley',
    propertyPrice: 100,
  };

  return {
    ...state,
    turnPhase: phase,
    currentChallenge: challenge,
    pendingTileEvent: phase === 'SMART_BUY_CHALLENGE'
      ? propertyEvent
      : null,
    players: phase === 'JAIL_CHALLENGE'
      ? [{ ...state.players[0], isInJail: true }, state.players[1]]
      : state.players,
  };
}

const CASES: SoloCase[] = [
  { name: 'Smart Buy', phase: 'SMART_BUY_CHALLENGE', context: 'SMART_BUY', submit: gameService.submitSmartBuyAnswer },
  { name: 'Challenge Card', phase: 'CARD_MATH_CHALLENGE', context: 'CHALLENGE_CARD', submit: gameService.submitCardAnswer },
  { name: 'Jail', phase: 'JAIL_CHALLENGE', context: 'JAIL_ESCAPE', submit: gameService.submitJailAnswer },
];

describe('server-authoritative solo challenge deadlines', () => {
  afterEach(() => gameService.removeGame('game_TIMEOUT'));

  it.each(CASES)('turns an otherwise-correct $name answer received at the exact deadline into a timeout', ({ phase, context, submit }) => {
    const state = openChallenge(phase, context);
    const challenge = state.currentChallenge!;
    const before = state.players[0];
    gameService.replaceState(state.id, state);

    const outcome = submit(state.id, challenge.correctIndex, challenge.startedAt + challenge.timeLimit * 1_000);

    expect(outcome?.result.timedOut).toBe(true);
    expect(outcome?.result.isCorrect).toBe(false);
    expect(outcome?.result.newMastery).toBe(before.masteryStates[challenge.skillName]);
    expect(outcome?.state.players[0].consecutiveFailures[challenge.skillName]).toBe(
      before.consecutiveFailures[challenge.skillName]
    );
    expect(outcome?.result.reward.type).toBe('NONE');
  });

  it('accepts an answer received one millisecond before the exclusive deadline', () => {
    const state = openChallenge('CARD_MATH_CHALLENGE', 'CHALLENGE_CARD');
    const challenge = state.currentChallenge!;
    gameService.replaceState(state.id, state);

    const outcome = gameService.submitCardAnswer(
      state.id,
      challenge.correctIndex,
      challenge.startedAt + challenge.timeLimit * 1_000 - 1
    );

    expect(outcome?.result.timedOut).toBe(false);
    expect(outcome?.result.isCorrect).toBe(true);
  });

  it('does not grade a forced timeout twice after the challenge was cleared', () => {
    const state = openChallenge('CARD_MATH_CHALLENGE', 'CHALLENGE_CARD');
    gameService.replaceState(state.id, state);

    const first = gameService.submitCardAnswer(state.id, null, 21_000);
    const second = gameService.submitCardAnswer(state.id, null, 21_001);

    expect(first?.state.players[0].totalQuestions).toBe(1);
    expect(second).toBeNull();
    expect(gameService.getGameSync(state.id)?.players[0].totalQuestions).toBe(1);
  });
});
