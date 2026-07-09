import { selectChallenge, getAdjustedParams, determineHint } from '../bkt.selector';
import { ChallengeContext, SKILL_NAMES } from '../../features/game/game.types';

describe('BKT Question Selector', () => {
  const defaultMastery: Record<string, number> = {
    Addition: 0.3,
    Subtraction: 0.5,
    Multiplication: 0.1,
    Division: 0.2,
    Fractions: 0.4,
    Decimals: 0.6,
  };

  const noFailures: Record<string, number> = {
    Addition: 0, Subtraction: 0, Multiplication: 0,
    Division: 0, Fractions: 0, Decimals: 0,
  };

  describe('selectChallenge', () => {
    it('should return a valid MathChallenge for ROLL_DICE context', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'ROLL_DICE',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
      });

      expect(challenge.id).toBeTruthy();
      expect(challenge.text).toBeTruthy();
      expect(challenge.options.length).toBe(4);
      expect(challenge.correctIndex).toBeGreaterThanOrEqual(0);
      expect(challenge.correctIndex).toBeLessThan(4);
      expect(challenge.context).toBe('ROLL_DICE');
      expect(challenge.timeLimit).toBeGreaterThan(0);
    });

    it('should pick the weakest skill for ROLL_DICE', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'ROLL_DICE',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
      });

      // Multiplication has lowest mastery (0.1)
      expect(challenge.skillName).toBe('Multiplication');
    });

    it('should use contextual skills for BUY_PROPERTY', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'BUY_PROPERTY',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
        playerMoney: 500,
        propertyPrice: 200,
      });

      // BUY_PROPERTY maps to Subtraction, Addition
      expect(['Subtraction', 'Addition']).toContain(challenge.skillName);
      expect(challenge.text).toContain('$');
    });

    it('should use contextual skills for TAX', () => {
      const challenge = selectChallenge({
        masteryStates: defaultMastery,
        context: 'TAX',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
        taxTotalAssets: 1200,
        taxType: 'INCOME',
      });

      expect(['Decimals', 'Division']).toContain(challenge.skillName);
    });

    it('should reduce difficulty for JAIL_ESCAPE', () => {
      // Set all mastery high so base difficulty would be 3
      const highMastery: Record<string, number> = {};
      for (const s of SKILL_NAMES) highMastery[s] = 0.8;

      const challenge = selectChallenge({
        masteryStates: highMastery,
        context: 'JAIL_ESCAPE',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
      });

      // Difficulty should be reduced by 1 from 3 → 2
      expect(challenge.difficulty).toBeLessThanOrEqual(2);
    });

    it('should set appropriate time limits by difficulty', () => {
      const easyMastery: Record<string, number> = {};
      for (const s of SKILL_NAMES) easyMastery[s] = 0.1;

      const challenge = selectChallenge({
        masteryStates: easyMastery,
        context: 'ROLL_DICE',
        consecutiveFailures: noFailures,
        recentlySeenSkills: [],
      });

      // Difficulty 1 → 20 seconds
      expect(challenge.difficulty).toBe(1);
      expect(challenge.timeLimit).toBe(20);
    });
  });

  describe('getAdjustedParams', () => {
    it('should return correct params for each difficulty', () => {
      const easy = getAdjustedParams(1);
      expect(easy.pT).toBe(0.20);
      expect(easy.pS).toBe(0.05);

      const medium = getAdjustedParams(2);
      expect(medium.pT).toBe(0.15);
      expect(medium.pS).toBe(0.10);

      const hard = getAdjustedParams(3);
      expect(hard.pT).toBe(0.10);
      expect(hard.pS).toBe(0.15);
    });

    it('should always have pG = 0.25 (4-option MCQ)', () => {
      expect(getAdjustedParams(1).pG).toBe(0.25);
      expect(getAdjustedParams(2).pG).toBe(0.25);
      expect(getAdjustedParams(3).pG).toBe(0.25);
    });
  });

  describe('determineHint', () => {
    it('should return no hint for 0-1 consecutive failures', () => {
      const hint = determineHint(0, 0.5, 'Addition');
      expect(hint.level).toBe(0);
      expect(hint.content).toBeNull();
    });

    it('should return level 1 hint for 2 consecutive failures', () => {
      const hint = determineHint(2, 0.3, 'Multiplication');
      expect(hint.level).toBe(1);
      expect(hint.content).toBeTruthy();
    });

    it('should return level 2 hint for 3+ consecutive failures', () => {
      const hint = determineHint(3, 0.3, 'Division');
      expect(hint.level).toBe(2);
    });

    it('should return level 3 hint when mastery is critically low', () => {
      const hint = determineHint(1, 0.1, 'Fractions');
      expect(hint.level).toBe(3);
      expect(hint.content).toContain('Fractions');
    });
  });
});
