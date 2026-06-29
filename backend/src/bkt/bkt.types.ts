export interface BktParams {
  pL0: number; // Probability of initial knowledge
  pT: number;  // Probability of learning/transition
  pG: number;  // Probability of guessing correctly
  pS: number;  // Probability of slipping (answering incorrectly despite knowing)
}

export interface MasteryState {
  probabilityKnown: number; // Current P(L)
  isMastered: boolean;
}
