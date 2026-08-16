import { buildWorkedFeedback } from '../feedback';
import type { MathChallenge } from '../../features/game/game.types';

function challenge(overrides: Partial<MathChallenge> = {}): MathChallenge {
  return {
    id: 'feedback_addition',
    skillName: 'Addition',
    difficulty: 1,
    questionData: {
      type: 'column',
      operation: '+',
      topNumber: 47,
      bottomNumber: 25,
      placeValues: { tens: { top: 4, bottom: 2 }, ones: { top: 7, bottom: 5 } },
      answer: 72,
      hasRegrouping: true,
      answerDigits: { tens: 7, ones: 2 },
      missingPosition: 'answer',
    },
    text: '47 + 25 = ?',
    options: ['71', '72', '73', '74'],
    correctIndex: 1,
    context: 'ROLL_CHALLENGE',
    timeLimit: 25,
    startedAt: 1_000,
    hintLevel: 0,
    hintContent: null,
    fingerprint: 'addition:47:25',
    ...overrides,
  };
}

describe('buildWorkedFeedback', () => {
  it('gives the answerer a concise operation-specific worked addition line', () => {
    expect(buildWorkedFeedback(challenge())).toBe('Addition: 47 + 25 = 72.');
  });

  it('includes a division remainder when the issued question has one', () => {
    expect(buildWorkedFeedback(challenge({
      skillName: 'Division',
      questionData: {
        type: 'long_division',
        divisor: 4,
        dividend: 86,
        quotient: 21,
        remainder: 2,
        steps: [],
        missingTarget: 'remainder',
        missingStepIndex: 0,
      },
      text: '86 ÷ 4 = ?',
      options: ['21 r 2', '22', '20 r 6', '21'],
      correctIndex: 0,
    }))).toBe('Division: 86 ÷ 4 = 21 remainder 2.');
  });
});
