// Phase 4C — the teaching-quality changes.
//
// Distractors that correspond to real mistakes and division readiness checks.

import {
  addWithoutCarrying,
  subtractSmallerFromLarger,
  generateQuestion,
} from '../question.generator';
import { capDivisionDifficulty, selectChallenge } from '../bkt.selector';
import { BOARD_TILES } from '../../features/game/board.config';
import { SKILL_NAMES } from '../../features/game/game.constants';
import type { ColumnQuestion } from '../../features/game/game.types';

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
          // The current arithmetic bank uses nonnegative answers.
          for (const option of q.options) {
            expect(Number(option)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('Division readiness', () => {
  it('caps division when multiplication or subtraction evidence is weak', () => {
    expect(capDivisionDifficulty(3, {
      Division: 0.9, Multiplication: 0.2, Subtraction: 0.9, Addition: 0.9,
    }, { Division: 10, Multiplication: 1, Subtraction: 10, Addition: 10 })).toBe(1);
  });

  it('applies prerequisite readiness only after Division is selected', () => {
    const challenge = selectChallenge({
      masteryStates: { Division: 0.9, Multiplication: 0.9, Subtraction: 0.2, Addition: 0.9 },
      context: 'CHALLENGE_CARD',
      consecutiveFailures: { Addition: 0, Subtraction: 0, Multiplication: 0, Division: 0 },
      skillAttempts: { Addition: 10, Subtraction: 1, Multiplication: 10, Division: 10 },
      forceSkill: 'Division',
    });

    expect(challenge.skillName).toBe('Division');
    expect(challenge.difficulty).toBe(1);
  });
});

describe('Board balance', () => {
  const properties = BOARD_TILES.filter((t) => t.type === 'PROPERTY');

  it('splits property themes evenly between Addition and Subtraction', () => {
    const counts = Object.fromEntries(SKILL_NAMES.map((s) => [s, 0])) as Record<string, number>;
    for (const tile of properties) {
      if (tile.skillTheme) counts[tile.skillTheme]++;
    }

    expect(counts.Addition).toBe(5);
    expect(counts.Subtraction).toBe(5);
    expect(counts.Multiplication).toBe(0);
    expect(counts.Division).toBe(0);

    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(properties.length);
  });

  it('gives every property tile a skill', () => {
    for (const tile of properties) {
      expect(tile.skillTheme).not.toBeNull();
    }
  });
});
