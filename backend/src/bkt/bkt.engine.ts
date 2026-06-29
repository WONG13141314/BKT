import { BktParams } from './bkt.types';
import { clampProbability } from './bkt.utils';

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
