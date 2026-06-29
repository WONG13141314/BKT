import { updateMastery } from '../bkt.engine';
import { DEFAULT_BKT_PARAMS } from '../bkt.defaults';
import { clampProbability, checkMastery } from '../bkt.utils';

describe('BKT Engine', () => {
  describe('updateMastery', () => {
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
      let p = DEFAULT_BKT_PARAMS.pL0;
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
