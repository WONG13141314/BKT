import { calculateFinalScores, generateMasteryReport, initializeGameState } from '../features/game/game.engine';
import type { FinalScore, GameState, MasteryReport, MathChallenge } from '../features/game/game.types';

const PLAYERS = [
  { id: 'seat-1', playerId: 'db-player-1', name: 'Aina', color: '#6366f1', order: 0 },
  { id: 'seat-2', playerId: 'db-player-2', name: 'Ben', color: '#f59e0b', order: 1 },
];

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return { ...initializeGameState('game_TEST', PLAYERS), ...overrides };
}

export function makePrivateChallenge(overrides: Partial<MathChallenge> = {}): MathChallenge {
  return {
    id: 'challenge-1',
    skillName: 'Addition',
    difficulty: 1,
    questionData: {
      type: 'column', operation: '+', topNumber: 1, bottomNumber: 1,
      placeValues: { tens: { top: 0, bottom: 0 }, ones: { top: 1, bottom: 1 } },
      answer: 2, hasRegrouping: false, answerDigits: { tens: 0, ones: 2 },
      missingPosition: 'answer',
    },
    text: '1 + 1 = ?',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    context: 'CHALLENGE_CARD',
    timeLimit: 20,
    startedAt: 1_000,
    hintLevel: 0,
    hintContent: null,
    fingerprint: 'column:+:1:1:answer:-:-',
    ...overrides,
  };
}

export function makeFinishedFixture(): {
  state: GameState;
  scores: FinalScore[];
  report: MasteryReport;
} {
  const state = makeGameState({ phase: 'FINISHED' });
  return {
    state,
    scores: calculateFinalScores(state),
    report: generateMasteryReport(state.players[0]),
  };
}
