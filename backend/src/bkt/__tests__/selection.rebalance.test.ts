// Phase 4A — skill selection and difficulty pacing.
//
// These are statistical properties, so they run many draws and assert on the
// distribution rather than on any single pick.

import { RECENT_SKILL_HISTORY_LIMIT, selectChallenge } from '../bkt.selector';
import { updateMastery } from '../bkt.engine';
import { BKT_PARAMS_BY_DIFFICULTY, INITIAL_MASTERY } from '../bkt.defaults';
import { questionFingerprint } from '../question.fingerprint';
import * as questionGenerator from '../question.generator';
import { ACTIVE_SKILL_NAMES, type SkillName } from '../../features/game/game.constants';
import type { GeneratedQuestion } from '../question.generator';

const DRAWS = 600;

function tally(pick: () => SkillName): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(ACTIVE_SKILL_NAMES.map((s) => [s, 0]));
  for (let i = 0; i < DRAWS; i++) counts[pick()]++;
  return counts;
}

const NO_FAILURES: Record<string, number> = {};

function additionQuestion(topNumber: number, bottomNumber: number): GeneratedQuestion {
  return {
    questionData: {
      type: 'column', operation: '+', topNumber, bottomNumber,
      placeValues: { tens: { top: 0, bottom: 0 }, ones: { top: topNumber, bottom: bottomNumber } },
      answer: topNumber + bottomNumber,
      hasRegrouping: false,
      answerDigits: { tens: 0, ones: topNumber + bottomNumber },
      missingPosition: 'answer',
    },
    text: `${topNumber} + ${bottomNumber} = (?)`,
    options: ['0', '1', '2', '3'],
    correctIndex: 0,
    difficulty: 1,
    skillName: 'Addition',
  };
}

function withSeededRandom<T>(seed: number, action: () => T): T {
  const originalRandom = Math.random;
  let state = seed;
  Math.random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };

  try {
    return action();
  } finally {
    Math.random = originalRandom;
  }
}

describe('Skill selection', () => {
  const weakAtSubtraction = {
    Addition: 0.85,
    Subtraction: 0.10,
    Multiplication: 0.85,
    Division: 0.85,
  };

  it('targets the weakest skill without monopolising the session', () => {
    const counts = withSeededRandom(0xB17, () => tally(
      () =>
        selectChallenge({
          masteryStates: weakAtSubtraction,
          context: 'CHALLENGE_CARD',
          consecutiveFailures: NO_FAILURES,
        }).skillName
    ));

    // The acceptance target for Phase 4: a player weak in Division sees it at
    // least 40% of the time.
    expect(counts.Subtraction / DRAWS).toBeGreaterThan(0.4);

    // But the old picker took the argmax every draw, which buried a child in
    // their worst subject. Every skill must keep a real share.
    for (const skill of ACTIVE_SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
    expect(counts.Subtraction / DRAWS).toBeLessThan(0.95);
  });

  it('still surfaces a mastered skill occasionally, so retention is visible', () => {
    const counts = withSeededRandom(0xCAFE, () => tally(
      () =>
        selectChallenge({
          masteryStates: {
            Addition: 0.99,
            Subtraction: 0.99,
            Multiplication: 0.99,
            Division: 0.99,
          },
          context: 'CHALLENGE_CARD',
          consecutiveFailures: NO_FAILURES,
        }).skillName
    ));

    for (const skill of ACTIVE_SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
  });

  it('treats a property theme as a preference, not a rule', () => {
    const counts = withSeededRandom(0xF00D, () => tally(
      () =>
        selectChallenge({
          masteryStates: {
            Addition: 0.5,
            Subtraction: 0.5,
            Multiplication: 0.5,
            Division: 0.5,
          },
          context: 'SMART_BUY',
          consecutiveFailures: NO_FAILURES,
          propertySkillTheme: 'Addition',
        }).skillName
    ));

    // Boosted, so clearly ahead of an even 25% split...
    expect(counts.Addition / DRAWS).toBeGreaterThan(0.3);
    // ...but not the hard filter it used to be, which collapsed the candidate
    // list to one skill and left BKT with nothing to decide.
    expect(counts.Addition / DRAWS).toBeLessThan(0.5);
    for (const skill of ACTIVE_SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
  });

  it('keeps all four skills reachable in Smart Buy despite a property theme', () => {
    const counts = withSeededRandom(0x5A17, () => tally(
      () => selectChallenge({
        masteryStates: {
          Addition: 0.5,
          Subtraction: 0.5,
          Multiplication: 0.5,
          Division: 0.5,
        },
        context: 'SMART_BUY',
        consecutiveFailures: NO_FAILURES,
        skillAttempts: { Addition: 10, Subtraction: 10, Multiplication: 10, Division: 10 },
        propertySkillTheme: 'Addition',
      }).skillName
    ));

    for (const skill of ACTIVE_SKILL_NAMES) {
      expect(counts[skill]).toBeGreaterThan(0);
    }
  });

  it('honours a forced skill exactly, for duels', () => {
    for (let i = 0; i < 50; i++) {
      const challenge = selectChallenge({
        masteryStates: weakAtSubtraction,
        context: 'MATH_DUEL',
        consecutiveFailures: NO_FAILURES,
        forceSkill: 'Addition',
      });
      expect(challenge.skillName).toBe('Addition');
    }
  });

  it('reviews a skill omitted from the last eight questions even when it is mastered', () => {
    const challenge = selectChallenge({
      masteryStates: weakAtSubtraction,
      context: 'CHALLENGE_CARD',
      consecutiveFailures: NO_FAILURES,
      recentSkillHistory: ['Subtraction', 'Multiplication', 'Division', 'Subtraction',
        'Multiplication', 'Division', 'Subtraction', 'Division'],
      propertySkillTheme: 'Subtraction',
    });
    expect(challenge.skillName).toBe('Addition');
  });

  it('resolves equally overdue skills using weaker mastery first', () => {
    const challenge = selectChallenge({
      masteryStates: weakAtSubtraction,
      context: 'CHALLENGE_CARD',
      consecutiveFailures: NO_FAILURES,
      recentSkillHistory: Array<SkillName>(RECENT_SKILL_HISTORY_LIMIT).fill('Division'),
    });
    expect(challenge.skillName).toBe('Subtraction');
  });

  it('limits repeated skills and guarantees coverage during a full adaptive sequence', () => {
    const sequence = withSeededRandom(0x55AA, () => {
      const issued: SkillName[] = [];
      for (let i = 0; i < 96; i++) {
        issued.push(selectChallenge({
          masteryStates: weakAtSubtraction,
          context: 'SMART_BUY',
          consecutiveFailures: NO_FAILURES,
          propertySkillTheme: 'Subtraction',
          recentSkillHistory: issued.slice(-RECENT_SKILL_HISTORY_LIMIT),
        }).skillName);
      }
      return issued;
    });

    for (let start = 0; start <= sequence.length - 4; start++) {
      expect(new Set(sequence.slice(start, start + 4)).size).toBeGreaterThan(1);
    }
    // After eight omitted issuances, at most three overdue skills are serviced.
    for (let start = 0; start <= sequence.length - 11; start++) {
      expect(new Set(sequence.slice(start, start + 11)).size).toBe(ACTIVE_SKILL_NAMES.length);
    }
  });

  it('uses only the supplied player history without mutating it', () => {
    const playerOne = Object.freeze<SkillName[]>([
      'Subtraction', 'Multiplication', 'Division', 'Subtraction',
      'Multiplication', 'Division', 'Subtraction', 'Division',
    ]);
    const playerTwo = Object.freeze<SkillName[]>([
      'Addition', 'Multiplication', 'Division', 'Addition',
      'Multiplication', 'Division', 'Addition', 'Division',
    ]);
    const input = { masteryStates: weakAtSubtraction, context: 'CHALLENGE_CARD' as const,
      consecutiveFailures: NO_FAILURES };
    expect(selectChallenge({ ...input, recentSkillHistory: playerOne }).skillName).toBe('Addition');
    expect(selectChallenge({ ...input, recentSkillHistory: playerTwo }).skillName).toBe('Subtraction');
    expect(selectChallenge({ ...input, recentSkillHistory: playerOne }).skillName).toBe('Addition');
    expect(playerOne).toHaveLength(8);
    expect(playerTwo).toHaveLength(8);
  });

  it('keeps explicit forced duel skills despite recency pacing', () => {
    const challenge = selectChallenge({
      masteryStates: weakAtSubtraction,
      context: 'MATH_DUEL',
      consecutiveFailures: NO_FAILURES,
      recentSkillHistory: Array<SkillName>(RECENT_SKILL_HISTORY_LIMIT).fill('Subtraction'),
      forceSkill: 'Subtraction',
    });
    expect(challenge.skillName).toBe('Subtraction');
  });
});

describe('Difficulty pacing', () => {
  const ask = (pMastery: number, attempts: number) =>
    selectChallenge({
      masteryStates: { Addition: pMastery },
      context: 'CHALLENGE_CARD',
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
      context: 'CHALLENGE_CARD',
      consecutiveFailures: { Addition: 2 },
      skillAttempts: { Addition: 20 },
      forceSkill: 'Addition',
    });

    expect(challenge.difficulty).toBe(1);
  });

  it('prevents an easy-to-hard jump without changing the initial tier for returning players', () => {
    const input = { masteryStates: { Addition: 0.95 }, context: 'CHALLENGE_CARD' as const,
      consecutiveFailures: NO_FAILURES, skillAttempts: { Addition: 12 },
      forceSkill: 'Addition' as const };
    expect(selectChallenge(input).difficulty).toBe(3);
    expect(selectChallenge({ ...input, previousDifficultyBySkill: { Addition: 1 } }).difficulty).toBe(2);
    expect(selectChallenge({ ...input, previousDifficultyBySkill: { Addition: 2 } }).difficulty).toBe(3);
    expect(selectChallenge({ ...input, previousDifficultyBySkill: { Addition: 3 },
      consecutiveFailures: { Addition: 2 } }).difficulty).toBe(1);
  });

  it('preserves division readiness caps while smoothing upward tiers', () => {
    const challenge = selectChallenge({
      masteryStates: { Division: 0.95, Multiplication: 0.2, Subtraction: 0.9 },
      context: 'CHALLENGE_CARD', consecutiveFailures: NO_FAILURES,
      skillAttempts: { Division: 12, Multiplication: 1, Subtraction: 12 },
      previousDifficultyBySkill: { Division: 1 }, forceSkill: 'Division',
    });
    expect(challenge.difficulty).toBe(1);
  });

  it('advances a cold-start correct-answer sequence through easy, medium and hard', () => {
    let mastery = INITIAL_MASTERY;
    let previous: 1 | 2 | 3 | undefined;
    const tiers: number[] = [];
    for (let attempts = 0; attempts < 7; attempts++) {
      const challenge = selectChallenge({
        masteryStates: { Addition: mastery }, context: 'CHALLENGE_CARD',
        consecutiveFailures: NO_FAILURES, skillAttempts: { Addition: attempts },
        previousDifficultyBySkill: previous ? { Addition: previous } : {}, forceSkill: 'Addition',
      });
      tiers.push(challenge.difficulty);
      previous = challenge.difficulty;
      mastery = updateMastery(mastery, true, BKT_PARAMS_BY_DIFFICULTY[challenge.difficulty]);
    }
    expect(tiers).toEqual([1, 1, 2, 2, 2, 3, 3]);
  });
});

describe('Question rebalance', () => {
  afterEach(() => jest.restoreAllMocks());

  it('regenerates a normal challenge whose semantic fingerprint is recent', () => {
    const repeated = additionQuestion(7, 5);
    const fresh = additionQuestion(8, 5);
    const generate = jest.spyOn(questionGenerator, 'generateQuestion')
      .mockReturnValueOnce(repeated)
      .mockReturnValueOnce(fresh);

    const challenge = selectChallenge({
      masteryStates: { Addition: 0.1 },
      context: 'CHALLENGE_CARD',
      consecutiveFailures: NO_FAILURES,
      forceSkill: 'Addition',
      recentQuestionFingerprints: [questionFingerprint(additionQuestion(5, 7))],
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(challenge.fingerprint).toBe(questionFingerprint(fresh));
  });
});
