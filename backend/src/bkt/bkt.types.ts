export interface BktParams {
  pT: number;  // Probability of learning/transition
  pG: number;  // Probability of guessing correctly
  pS: number;  // Probability of slipping (answering incorrectly despite knowing)
}

export interface MasteryState {
  probabilityKnown: number; // Current P(L)
  isMastered: boolean;
}
