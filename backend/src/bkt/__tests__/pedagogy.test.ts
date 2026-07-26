// Phase 4C — the teaching-quality changes.
//
// Distractors that correspond to real mistakes, hints that name the thing the
// child is stuck on, and a board that gives each skill a fair share of tiles.

import {
  addWithoutCarrying,
  subtractSmallerFromLarger,
  generateQuestion,
} from '../question.generator';
import { determineHint, selectChallenge } from '../bkt.selector';
import { BOARD_TILES } from '../../features/game/board.config';
import { SKILL_NAMES } from '../../features/game/game.constants';
import type { ColumnQuestion, LongDivisionQuestion } from '../../features/game/game.types';

describe('Misconception distractors', () => {
  it('reproduces the forgot-to-carry answer', () => {
    // 47 + 25 = 72. Dropping the carry from the ones column gives 62.
    expect(addWithoutCarrying(47, 25)).toBe(62);
    expect(addWithoutCarrying(8, 7)).toBe(5);
    // Nothing to carry — the wrong method happens to give the right answer.
    expect(addWithoutCarrying(31, 24)).toBe(55);
  });

  it('reproduces the smaller-from-larger subtraction error', () => {
    // 52 − 37 = 15. Taking |2−7| in the ones column gives 25.
    expect(subtractSmallerFromLarger(52, 37)).toBe(25);
    expect(subtractSmallerFromLarger(80, 46)).toBe(46);
    // No borrow needed — the wrong method agrees with the right one.
    expect(subtractSmallerFromLarger(78, 34)).toBe(44);
  });

  it.each([
    ['Addition', addWithoutCarrying] as const,
    ['Subtraction', subtractSmallerFromLarger] as const,
  ])('always offers the %s misconception when it applies', (skill, mistake) => {
    let applicable = 0;
    let offered = 0;

    // Difficulty 3 forces regrouping, so this is where the trap is reachable.
    for (let i = 0; i < 400; i++) {
      const q = generateQuestion(skill, 3);
      const data = q.questionData as ColumnQuestion;
      if (data.type !== 'column' || data.missingPosition !== 'answer') continue;

      const trap = mistake(data.topNumber, data.bottomNumber);
      // Only meaningful when the wrong method gives a different number.
      if (trap === data.answer || trap < 0) continue;

      applicable++;
      if (q.options.includes(String(trap))) offered++;
    }

    expect(applicable).toBeGreaterThan(0);
    // Not "sometimes" — the misconception is seeded first, so it is always there.
    expect(offered).toBe(applicable);
  });

  it('offers a one-group-out answer for multiplication', () => {
    let applicable = 0;
    let offered = 0;

    for (let i = 0; i < 200; i++) {
      const q = generateQuestion('Multiplication', 1);
      const data = q.questionData as ColumnQuestion;
      if (data.type !== 'column' || data.missingPosition !== 'answer') continue;

      applicable++;
      // One group too few or too many — the skip-counting slip.
      const traps = [data.answer - data.topNumber, data.answer + data.topNumber];
      if (traps.some((v) => q.options.includes(String(v)))) offered++;
    }

    expect(applicable).toBeGreaterThan(0);
    expect(offered).toBe(applicable);
  });

  it('still produces four unique options with the correct one among them', () => {
    for (const skill of SKILL_NAMES) {
      for (const difficulty of [1, 2, 3] as const) {
        for (let i = 0; i < 30; i++) {
          const q = generateQuestion(skill, difficulty);

          expect(q.options).toHaveLength(4);
          expect(new Set(q.options).size).toBe(4);
          expect(q.correctIndex).toBeGreaterThanOrEqual(0);
          expect(q.correctIndex).toBeLessThan(4);
          // No negative options — they read as nonsense to a Standard 1 child.
          for (const option of q.options) {
            expect(Number(option)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('Hints', () => {
  it('stays silent until the player has actually struggled', () => {
    expect(determineHint(0, 0.5, 'Addition').content).toBeNull();
    expect(determineHint(0, 0.5, 'Addition').level).toBe(0);
  });

  it('names the column a missing digit sits in', () => {
    const question: ColumnQuestion = {
      type: 'column',
      operation: '+',
      topNumber: 47,
      bottomNumber: 25,
      placeValues: { tens: { top: 4, bottom: 2 }, ones: { top: 7, bottom: 5 } },
      answer: 72,
      hasRegrouping: true,
      answerDigits: { tens: 7, ones: 2 },
      missingPosition: 'internal_digit',
      missingDigitPlace: 'tens',
    };

    const hint = determineHint(1, 0.5, 'Addition', question);
    expect(hint.content).toContain('tens');
  });

  it('talks about borrowing for subtraction and carrying for addition', () => {
    const base = {
      type: 'column' as const,
      topNumber: 52,
      bottomNumber: 37,
      placeValues: { tens: { top: 5, bottom: 3 }, ones: { top: 2, bottom: 7 } },
      answer: 15,
      hasRegrouping: true,
      answerDigits: { tens: 1, ones: 5 },
      missingPosition: 'answer' as const,
    };

    const subtraction = determineHint(2, 0.5, 'Subtraction', { ...base, operation: '-' });
    expect(subtraction.content?.toLowerCase()).toContain('borrow');

    const addition = determineHint(2, 0.5, 'Addition', { ...base, operation: '+' });
    expect(addition.content?.toLowerCase()).toContain('carr');
  });

  it('points at the actual division step', () => {
    const question: LongDivisionQuestion = {
      type: 'long_division',
      divisor: 4,
      dividend: 84,
      quotient: 21,
      remainder: 0,
      steps: [],
      missingTarget: 'product',
      missingStepIndex: 0,
    };

    const hint = determineHint(1, 0.5, 'Division', question);
    expect(hint.content).toContain('4');
    expect(hint.content?.toLowerCase()).toContain('multiply');
  });

  it('never repeats one generic sentence for every question', () => {
    // The old implementation returned the same three strings regardless of the
    // question, which is what made hints useless.
    const seen = new Set<string>();

    for (let i = 0; i < 60; i++) {
      const challenge = selectChallenge({
        masteryStates: { Division: 0.3, Addition: 0.3, Subtraction: 0.3, Multiplication: 0.3 },
        context: 'ROLL_CHALLENGE',
        consecutiveFailures: { Addition: 2, Subtraction: 2, Multiplication: 2, Division: 2 },
        skillAttempts: { Addition: 9, Subtraction: 9, Multiplication: 9, Division: 9 },
      });
      if (challenge.hintContent) seen.add(challenge.hintContent);
    }

    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('Board balance', () => {
  const properties = BOARD_TILES.filter((t) => t.type === 'PROPERTY');

  it('gives every skill a fair share of property tiles', () => {
    const counts = Object.fromEntries(SKILL_NAMES.map((s) => [s, 0])) as Record<string, number>;
    for (const tile of properties) {
      if (tile.skillTheme) counts[tile.skillTheme]++;
    }

    // 10 tiles cannot split evenly across 4 skills, so the spread is 2 or 3.
    // Before Phase 4 Subtraction had 4 and everything else had 2.
    for (const skill of SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThanOrEqual(2);
      expect(counts[skill]).toBeLessThanOrEqual(3);
    }

    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(properties.length);
  });

  it('gives every property tile a skill', () => {
    for (const tile of properties) {
      expect(tile.skillTheme).not.toBeNull();
    }
  });
});
