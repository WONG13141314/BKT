import { selectChallenge, getAdjustedParams, determineHint } from '../bkt.selector';
import { ChallengeContext, SKILL_NAMES } from '../../features/game/game.types';
import { ACTIVE_SKILL_NAMES } from '../../features/game/game.constants';
import { BKT_PARAMS_BY_DIFFICULTY } from '../bkt.defaults';
import { baseInput, masteryFor } from '../../test/bkt.fixtures';

describe('BKT Question Selector', () => {
  const defaultMastery: Record<string, number> = {
    Addition: 0.5,
    Subtraction: 0.4,
    Multiplication: 0.1,
    Division: 0.2,
  };

  const noFailures: Record<string, number> = {
    Addition: 0, Subtraction: 0, Multiplication: 0, Division: 0,
  };

  describe('selectChallenge', () => {
    it('keeps every primary-math skill live', () => {
      expect(ACTIVE_SKILL_NAMES).toEqual(['Addition', 'Subtraction', 'Multiplication', 'Division']);
    });

    it.each([[1, 25], [2, 20], [3, 15]] as const)(
      'assigns difficulty %s a %s second answer window',
      (difficulty, seconds) => {
        const challenge = selectChallenge(baseInput({
          forceSkill: 'Addition',
          mastery: masteryFor(difficulty),
        }));

        expect(challenge.difficulty).toBe(difficulty);
        expect(challenge.timeLimit).toBe(seconds);
      }
    );

    it('should return a valid MathChallenge for ROLL_CHALLENGE context', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'ROLL_CHALLENGE',
        consecutiveFailures: noFailures,
      });

      expect(challenge.id).toBeTruthy();
      expect(challenge.text).toBeTruthy();
      expect(challenge.options.length).toBe(4);
      expect(challenge.correctIndex).toBeGreaterThanOrEqual(0);
      expect(challenge.correctIndex).toBeLessThan(4);
      expect(challenge.context).toBe('ROLL_CHALLENGE');
      expect(challenge.timeLimit).toBe(25);
    });

    it('should use contextual skills for SMART_BUY', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'SMART_BUY',
        consecutiveFailures: noFailures,
        propertyPrice: 200,
      });

      expect(['Addition', 'Subtraction', 'Multiplication', 'Division']).toContain(challenge.skillName);
      expect(challenge.timeLimit).toBe(25);
    });

    it('should reduce difficulty for JAIL_ESCAPE', () => {
      const highMastery: Record<string, number> = {};
      for (const s of SKILL_NAMES) highMastery[s] = 0.8;

      const challenge = selectChallenge({
        masteryStates: highMastery,
        context: 'JAIL_ESCAPE',
        consecutiveFailures: noFailures,
      });

      expect(challenge.difficulty).toBeLessThanOrEqual(2);
    });

    it('uses the easy-question time limit for solo questions', () => {
      const easyMastery: Record<string, number> = {};
      for (const s of SKILL_NAMES) easyMastery[s] = 0.1;

      const challenge = selectChallenge({
        masteryStates: easyMastery,
        context: 'CHALLENGE_CARD',
        consecutiveFailures: noFailures,
      });

      expect(challenge.difficulty).toBe(1);
      expect(challenge.timeLimit).toBe(25);
    });
  });

  describe('getAdjustedParams', () => {
    it('reads the single parameter table in bkt.defaults', () => {
      for (const difficulty of [1, 2, 3] as const) {
        expect(getAdjustedParams(difficulty)).toEqual(BKT_PARAMS_BY_DIFFICULTY[difficulty]);
      }
    });

    it('makes harder questions slower to learn and easier to slip on', () => {
      const [easy, medium, hard] = [1, 2, 3].map((d) => getAdjustedParams(d as 1 | 2 | 3));

      expect(easy.pT).toBeGreaterThan(medium.pT);
      expect(medium.pT).toBeGreaterThan(hard.pT);
      expect(easy.pG).toBeGreaterThan(hard.pG);
      expect(easy.pS).toBeLessThan(hard.pS);
    });
  });

  describe('determineHint', () => {
    it('should return no hint for 0 consecutive failures', () => {
      const hint = determineHint(0, 0.5, 'Addition');
      expect(hint.level).toBe(0);
      expect(hint.content).toBeNull();
    });

    it('should return hint level when mastery is critically low', () => {
      const hint = determineHint(1, 0.1, 'Division');
      expect(hint.level).toBe(3);
      expect(hint.content).toContain('Division');
    });
  });
});
