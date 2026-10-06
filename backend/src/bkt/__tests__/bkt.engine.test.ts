import { predictCorrectProbability, updateMastery } from '../bkt.engine';
import { DEFAULT_BKT_PARAMS, INITIAL_MASTERY } from '../bkt.defaults';
import { clampProbability, checkMastery } from '../bkt.utils';

describe('BKT Engine', () => {
  describe('pre-answer probability', () => {
    it('uses both known and unknown answer likelihoods without applying a learning transition', () => {
      expect(predictCorrectProbability(0.5, DEFAULT_BKT_PARAMS)).toBeCloseTo(0.575);
      expect(predictCorrectProbability(0, DEFAULT_BKT_PARAMS)).toBe(DEFAULT_BKT_PARAMS.pG);
      expect(predictCorrectProbability(1, DEFAULT_BKT_PARAMS)).toBe(1 - DEFAULT_BKT_PARAMS.pS);
      expect(predictCorrectProbability(0.5, { ...DEFAULT_BKT_PARAMS, pT: 0.9 })).toBeCloseTo(0.575);
    });

    it.each([NaN, Infinity, -0.01, 1.01])('rejects invalid mastery %s in prediction and updating', (value) => {
      expect(() => predictCorrectProbability(value, DEFAULT_BKT_PARAMS)).toThrow(RangeError);
      expect(() => updateMastery(value, true, DEFAULT_BKT_PARAMS)).toThrow(RangeError);
    });

    it.each(['pT', 'pG', 'pS'] as const)('rejects invalid %s instead of persisting NaN', (key) => {
      for (const value of [NaN, Infinity, -0.01, 1.01]) {
        const params = { ...DEFAULT_BKT_PARAMS, [key]: value };
        expect(() => predictCorrectProbability(0.5, params)).toThrow(RangeError);
        expect(() => updateMastery(0.5, false, params)).toThrow(RangeError);
      }
    });
  });

  describe('updateMastery', () => {
    it('rejects observations that are impossible under the supplied model', () => {
      expect(() => updateMastery(0.5, true, { pT: 0.1, pG: 0, pS: 1 })).toThrow(RangeError);
      expect(() => updateMastery(0.5, false, { pT: 0.1, pG: 1, pS: 0 })).toThrow(RangeError);
    });

    it('matches Bayes conditioning followed by the learning transition', () => {
      const before = 0.4;
      const predictedCorrect = predictCorrectProbability(before, DEFAULT_BKT_PARAMS);
      const posterior = before * (1 - DEFAULT_BKT_PARAMS.pS) / predictedCorrect;
      expect(updateMastery(before, true, DEFAULT_BKT_PARAMS)).toBeCloseTo(
        posterior + (1 - posterior) * DEFAULT_BKT_PARAMS.pT
      );
    });
    it('should increase probability of mastery when answer is correct', () => {
      const initialP = 0.5;
      const newP = updateMastery(initialP, true, DEFAULT_BKT_PARAMS);
      expect(newP).toBeGreaterThan(initialP);
    });

    it('should decrease probability of mastery when answer is incorrect', () => {
      const initialP = 0.5;
      const newP = updateMastery(initialP, false, DEFAULT_BKT_PARAMS);
      expect(newP).toBeLessThan(initialP);
    });

    it('should stay within bounds (0.001 to 0.999) after many correct answers', () => {
      let p = INITIAL_MASTERY;
      for (let i = 0; i < 20; i++) {
        p = updateMastery(p, true, DEFAULT_BKT_PARAMS);
      }
      expect(p).toBeLessThanOrEqual(0.999);
      expect(p).toBeGreaterThan(0.95);
    });

    it('should stay within bounds (0.001 to 0.999) after many incorrect answers', () => {
      let p = 0.9;
      for (let i = 0; i < 20; i++) {
        p = updateMastery(p, false, DEFAULT_BKT_PARAMS);
      }
      // The lowest it can go is bounded by P(T) (0.15), because the student
      // always has a chance to learn from the attempt itself.
      expect(p).toBeGreaterThanOrEqual(0.15);
      expect(p).toBeLessThan(0.2);
    });
  });

  describe('bkt.utils', () => {
    it('clampProbability limits values correctly', () => {
      expect(clampProbability(1.0)).toBe(0.999);
      expect(clampProbability(0.0)).toBe(0.001);
      expect(clampProbability(0.5)).toBe(0.5);
    });

    it('checkMastery evaluates correctly', () => {
      expect(checkMastery(0.96)).toBe(true);
      expect(checkMastery(0.5)).toBe(false);
    });
  });
});
