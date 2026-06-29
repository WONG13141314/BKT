import { BktParams } from './bkt.types';

// Default parameters based on standard educational research for 4-option multiple choice
export const DEFAULT_BKT_PARAMS: BktParams = {
  pL0: 0.1,  // Start with 10% assumption of prior knowledge
  pT: 0.15,  // ~15% chance to learn from a single exposure
  pG: 0.25,  // 25% chance to guess a 4-option question correctly
  pS: 0.1,   // 10% chance to slip (careless mistake)
};

// Threshold to consider a skill officially mastered
export const MASTERY_THRESHOLD = 0.95;
