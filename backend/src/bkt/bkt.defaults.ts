import { BktParams } from './bkt.types';

// Hand-set prototype parameters for four-option questions. These are provisional
// assumptions, not estimates calibrated against the proposed 10–12-year-old cohort.
export const DEFAULT_BKT_PARAMS: BktParams = {
  pT: 0.15,  // ~15% chance to learn from a single exposure
  pG: 0.25,  // 25% chance to guess correctly (four answer choices)
  pS: 0.1,   // 10% chance to slip (careless mistake)
};

// Provisional per-difficulty assumptions. Preserve them until collected gameplay
// data supports a parameter fit assessed on separate evaluation data.
export const BKT_PARAMS_BY_DIFFICULTY: Record<1 | 2 | 3, BktParams> = {
  1: { pT: 0.12, pG: 0.30, pS: 0.05 },  // Easy: higher assumed guess rate, lower slip
  2: { pT: 0.10, pG: 0.25, pS: 0.10 },  // Medium: standard
  3: { pT: 0.08, pG: 0.20, pS: 0.15 },  // Hard: lower guess, higher slip
};

// Prototype reporting threshold; this is a model estimate, not independently
// validated evidence of mastery. It is separate from difficulty selection.
export const MASTERY_THRESHOLD = 0.85;

// Provisional cold-start prior shared by all skills. The target age alone does
// not establish prior knowledge; future calibration should estimate this value.
export const INITIAL_MASTERY = 0.10;

/**
 * Days without practising a skill before half the progress above the starting
 * prior is assumed lost.
 *
 * Hand-set, like the other parameters. This forgetting extension has not been
 * empirically validated for the proposed cohort and is a prototype limitation.
 */
export const FORGETTING_HALF_LIFE_DAYS = 21;
