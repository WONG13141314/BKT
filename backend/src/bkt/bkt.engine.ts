import { BktParams } from './bkt.types';
import { clampProbability } from './bkt.utils';
import { FORGETTING_HALF_LIFE_DAYS, INITIAL_MASTERY } from './bkt.defaults';

/**
 * Decay a stored mastery estimate toward the prior, based on how long it has
 * been since the skill was last practised.
 *
 * Textbook BKT has no forgetting term — it assumes knowledge only ever goes up.
 * That is a reasonable simplification for a system used in one sitting, which is
 * how BKT is usually deployed. This game deliberately remembers a learner across
 * weeks, which is exactly the case the assumption breaks: a child who mastered
 * Addition in March would return in June still rated 0.9, be handed the hardest
 * questions immediately, and fail them.
 *
 * The decay is exponential with a half-life: after `FORGETTING_HALF_LIFE_DAYS`
 * without practice, half the progress *above the starting prior* is gone. It
 * never decays below the prior — forgetting returns you to a beginner, not to
 * worse than a beginner.
 *
 * Applied at load time only, never mid-session, and never written back. It is a
 * pure function of elapsed time, so recomputing it on every load is idempotent
 * and cannot compound.
 */
export const applyForgetting = (
  storedMastery: number,
  lastPracticedAt: Date | null,
  now: Date = new Date()
): number => {
  if (!lastPracticedAt) return storedMastery;

  const days = (now.getTime() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return storedMastery;

  // Nothing to lose: at or below the prior, forgetting has no further effect.
  if (storedMastery <= INITIAL_MASTERY) return storedMastery;

  const retained = 0.5 ** (days / FORGETTING_HALF_LIFE_DAYS);
  const gainAbovePrior = storedMastery - INITIAL_MASTERY;

  return clampProbability(INITIAL_MASTERY + gainAbovePrior * retained);
};

/**
 * Updates the student's mastery probability based on their answer to a question.
 * 
 * @param currentP - The student's current probability of knowing the skill (P(L))
 * @param isCorrect - Whether the student answered the current question correctly
 * @param params - The BKT parameters (pL0, pT, pG, pS) for this skill
 * @returns The updated probability of knowing the skill (posterior P(L))
 */
export const updateMastery = (
  currentP: number,
  isCorrect: boolean,
  params: BktParams
): number => {
  const { pT, pG, pS } = params;
  let pObserved: number;

  // Step 1: Calculate Posterior Probability (Probability of knowing given the observation)
  if (isCorrect) {
    // P(L | Correct) = [P(L) * (1 - P(S))] / [P(L) * (1 - P(S)) + (1 - P(L)) * P(G)]
    const probCorrectGivenKnown = 1 - pS;
    const probCorrectGivenUnknown = pG;
    
    const numerator = currentP * probCorrectGivenKnown;
    const denominator = numerator + ((1 - currentP) * probCorrectGivenUnknown);
    
    pObserved = numerator / denominator;
  } else {
    // P(L | Incorrect) = [P(L) * P(S)] / [P(L) * P(S) + (1 - P(L)) * (1 - P(G))]
    const probIncorrectGivenKnown = pS;
    const probIncorrectGivenUnknown = 1 - pG;
    
    const numerator = currentP * probIncorrectGivenKnown;
    const denominator = numerator + ((1 - currentP) * probIncorrectGivenUnknown);
    
    pObserved = numerator / denominator;
  }

  // Step 2: Apply Transition Probability (Probability of learning the skill just now)
  // P(L_new) = P(L|Observed) + (1 - P(L|Observed)) * P(T)
  const pNew = pObserved + ((1 - pObserved) * pT);

  // Step 3: Clamp the final probability to prevent absolute 0 or 1
  return clampProbability(pNew);
};
