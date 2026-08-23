import { BktParams } from './bkt.types';

// Default parameters calibrated for Standard 1 primary school students
// with 4-option multiple choice questions
export const DEFAULT_BKT_PARAMS: BktParams = {
  pT: 0.15,  // ~15% chance to learn from a single exposure
  pG: 0.25,  // 25% chance to guess correctly (four answer choices)
  pS: 0.1,   // 10% chance to slip (careless mistake)
};

// Per-difficulty BKT parameters (Std 1 calibrated).
//
// pT was lowered in Phase 4. Phase 3's logging showed three correct answers
// taking P(L) from 0.10 to 0.94, because a high learn rate compounds on top of
// an already generous guess rate. A single exposure teaching a child the skill
// 15–20% of the time is optimistic for Standard 1; these values make mastery
// something the evidence has to earn.
export const BKT_PARAMS_BY_DIFFICULTY: Record<1 | 2 | 3, BktParams> = {
  1: { pT: 0.12, pG: 0.30, pS: 0.05 },  // Easy: high guess (young kids use elimination), low slip
  2: { pT: 0.10, pG: 0.25, pS: 0.10 },  // Medium: standard
  3: { pT: 0.08, pG: 0.20, pS: 0.15 },  // Hard: lower guess, higher slip
};

// Threshold to consider a skill officially mastered.
// Corbett & Anderson's standard value. 0.95 was unreachable in practice: with a
// 10% slip rate the posterior cannot stay that high through a normal run of
// answers, so no skill was ever recorded as mastered.
export const MASTERY_THRESHOLD = 0.85;

// Initial mastery for all skills (Standard 1 students start with low prior
// knowledge). This is the single prior — `BktParams.pL0` used to duplicate it
// and was read by nothing, so it has been removed.
export const INITIAL_MASTERY = 0.10;

/**
 * Days without practising a skill before half the progress above the starting
 * prior is assumed lost.
 *
 * Hand-set, like the other parameters, and declared as a limitation. Three weeks
 * is a deliberately conservative choice for primary arithmetic: long enough that
 * a child returning the next week is barely affected, short enough that a term
 * break is visible in the model.
 */
export const FORGETTING_HALF_LIFE_DAYS = 21;
