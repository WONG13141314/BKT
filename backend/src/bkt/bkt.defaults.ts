import { BktParams } from './bkt.types';

// Default parameters calibrated for Standard 1 primary school students
// with 4-option multiple choice questions
export const DEFAULT_BKT_PARAMS: BktParams = {
  pL0: 0.1,  // 10% assumption of prior knowledge
  pT: 0.15,  // ~15% chance to learn from a single exposure
  pG: 0.25,  // 25% chance to guess correctly (4-option MCQ baseline)
  pS: 0.1,   // 10% chance to slip (careless mistake)
};

// Per-difficulty BKT parameters (Std 1 calibrated)
export const BKT_PARAMS_BY_DIFFICULTY: Record<1 | 2 | 3, BktParams> = {
  1: { pL0: 0.10, pT: 0.20, pG: 0.30, pS: 0.05 },  // Easy: high guess (young kids use elimination), low slip
  2: { pL0: 0.10, pT: 0.15, pG: 0.25, pS: 0.10 },  // Medium: standard
  3: { pL0: 0.10, pT: 0.10, pG: 0.20, pS: 0.15 },  // Hard: lower guess, higher slip
};

// Threshold to consider a skill officially mastered
export const MASTERY_THRESHOLD = 0.95;

// Initial mastery for all skills (Standard 1 students start with low prior knowledge)
export const INITIAL_MASTERY = 0.10;
