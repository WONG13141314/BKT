import { MASTERY_THRESHOLD } from './bkt.defaults';

/**
 * Clamps a probability between 0.001 and 0.999.
 * This prevents the BKT model from ever reaching absolute 0 or 1,
 * which would break Bayes' theorem (making it impossible to change the probability further).
 */
export const clampProbability = (prob: number): number => {
  if (prob < 0.001) return 0.001;
  if (prob > 0.999) return 0.999;
  return prob;
};

/**
 * Checks if the current probability meets the mastery threshold.
 */
export const checkMastery = (probabilityKnown: number): boolean => {
  return probabilityKnown >= MASTERY_THRESHOLD;
};
