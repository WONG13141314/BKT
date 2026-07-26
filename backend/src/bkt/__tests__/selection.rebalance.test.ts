// Phase 4A — skill selection and difficulty pacing.
//
// These are statistical properties, so they run many draws and assert on the
// distribution rather than on any single pick.

import { selectChallenge } from '../bkt.selector';
import { SKILL_NAMES, type SkillName } from '../../features/game/game.constants';

const DRAWS = 600;

function tally(pick: () => SkillName): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(SKILL_NAMES.map((s) => [s, 0]));
  for (let i = 0; i < DRAWS; i++) counts[pick()]++;
  return counts;
}

const NO_FAILURES: Record<string, number> = {};

describe('Skill selection', () => {
  const weakAtDivision = {
    Addition: 0.85,
    Subtraction: 0.80,
    Multiplication: 0.75,
    Division: 0.10,
  };

  it('targets the weakest skill without monopolising the session', () => {
    const counts = tally(
      () =>
        selectChallenge({
          masteryStates: weakAtDivision,
          context: 'ROLL_CHALLENGE',
          consecutiveFailures: NO_FAILURES,
        }).skillName
    );

    // The acceptance target for Phase 4: a player weak in Division sees it at
    // least 40% of the time.
    expect(counts.Division / DRAWS).toBeGreaterThan(0.4);

    // But the old picker took the argmax every draw, which buried a child in
    // their worst subject. Every skill must keep a real share.
    for (const skill of SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
    expect(counts.Division / DRAWS).toBeLessThan(0.95);
  });

  it('still surfaces a mastered skill occasionally, so retention is visible', () => {
    const counts = tally(
      () =>
        selectChallenge({
          masteryStates: {
            Addition: 0.99,
            Subtraction: 0.99,
            Multiplication: 0.99,
            Division: 0.99,
          },
          context: 'ROLL_CHALLENGE',
          consecutiveFailures: NO_FAILURES,
        }).skillName
    );

    for (const skill of SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
  });

  it('treats a property theme as a preference, not a rule', () => {
    const counts = tally(
      () =>
        selectChallenge({
          masteryStates: {
            Addition: 0.5,
            Subtraction: 0.5,
            Multiplication: 0.5,
            Division: 0.5,
          },
          context: 'LEVEL_UP',
          consecutiveFailures: NO_FAILURES,
          propertySkillTheme: 'Multiplication',
        }).skillName
    );

    // Boosted, so clearly ahead of an even 25% split...
    expect(counts.Multiplication / DRAWS).toBeGreaterThan(0.3);
    // ...but not the hard filter it used to be, which collapsed the candidate
    // list to one skill and left BKT with nothing to decide.
    expect(counts.Multiplication / DRAWS).toBeLessThan(0.85);
    for (const skill of SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
  });

  it('honours a forced skill exactly, for duels', () => {
    for (let i = 0; i < 50; i++) {
      const challenge = selectChallenge({
        masteryStates: weakAtDivision,
        context: 'MATH_DUEL',
        consecutiveFailures: NO_FAILURES,
        forceSkill: 'Addition',
      });
      expect(challenge.skillName).toBe('Addition');
    }
  });
});

describe('Difficulty pacing', () => {
  const ask = (pMastery: number, attempts: number) =>
    selectChallenge({
      masteryStates: { Addition: pMastery },
      context: 'ROLL_CHALLENGE',
      consecutiveFailures: NO_FAILURES,
      skillAttempts: { Addition: attempts },
      forceSkill: 'Addition',
    }).difficulty;

  it('keeps a brand-new player on easy questions', () => {
    // Phase 3's logging showed three correct answers taking P(L) to 0.94. Without
    // an evidence floor that child would already be on the hardest tier.
    expect(ask(0.94, 0)).toBe(1);
    expect(ask(0.94, 1)).toBe(1);
  });

  it('will not go hard until the estimate has real evidence behind it', () => {
    expect(ask(0.94, 2)).toBe(2);
    expect(ask(0.94, 4)).toBe(2);
    expect(ask(0.94, 5)).toBe(3);
  });

  it('escalates with mastery once there is enough evidence', () => {
    const attempts = 12;
    expect(ask(0.20, attempts)).toBe(1);
    expect(ask(0.60, attempts)).toBe(2);
    expect(ask(0.90, attempts)).toBe(3);
  });

  it('drops to easy after repeated failures, to rebuild confidence', () => {
    const challenge = selectChallenge({
      masteryStates: { Addition: 0.9 },
      context: 'ROLL_CHALLENGE',
      consecutiveFailures: { Addition: 2 },
      skillAttempts: { Addition: 20 },
      forceSkill: 'Addition',
    });

    expect(challenge.difficulty).toBe(1);
  });
});
