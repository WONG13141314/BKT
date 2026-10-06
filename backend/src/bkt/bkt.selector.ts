// ============================================
// BKT Question Selector
// 4 Skills: Addition, Subtraction, Multiplication, Division
// Picks a skill and difficulty using each player's own evidence and history.
// ============================================

import { ChallengeContext, MathChallenge } from '../features/game/game.types';
import { ACTIVE_SKILL_NAMES, QUESTION_TIME_LIMITS, SkillName } from '../features/game/game.constants';
import { generateQuestion, type GeneratedQuestion } from './question.generator';
import { generateDistinctQuestion } from './question.fingerprint';
import { BKT_PARAMS_BY_DIFFICULTY, INITIAL_MASTERY } from './bkt.defaults';

// ---- Context-to-Skill Mapping ----

const CONTEXT_SKILL_MAP: Record<ChallengeContext, readonly SkillName[]> = {
  MATH_DUEL: ACTIVE_SKILL_NAMES,                          // Themed by the disputed property
  SMART_BUY: ACTIVE_SKILL_NAMES,                          // Same adaptive calculation bank
  CHALLENGE_CARD: ACTIVE_SKILL_NAMES,                     // All skills eligible
  JAIL_ESCAPE: ACTIVE_SKILL_NAMES,                        // All, reduced difficulty
};

// ---- Difficulty from Mastery ----
//
// Two guards, both added in Phase 4 after Phase 3's logging showed three correct
// answers taking P(L) from 0.10 to 0.94 — a child who guessed well three times
// was being thrown onto the hardest tier.
//
//   1. Wider bands, so "hard" means genuinely confident.
//   2. An evidence floor. A mastery estimate built on one or two observations is
//      mostly prior, not knowledge, so it may not unlock the harder tiers yet.

const BAND_MEDIUM = 0.50;
const BAND_HARD = 0.80;

/** Below this many answered observations on a skill, only difficulty 1 is used. */
const MIN_ATTEMPTS_FOR_MEDIUM = 2;
/** Below this many, difficulty 3 stays locked however high P(L) has climbed. */
const MIN_ATTEMPTS_FOR_HARD = 5;

function getDifficultyFromMastery(pMastery: number, attempts: number): 1 | 2 | 3 {
  let difficulty: 1 | 2 | 3 = pMastery < BAND_MEDIUM ? 1 : pMastery < BAND_HARD ? 2 : 3;

  if (attempts < MIN_ATTEMPTS_FOR_MEDIUM) difficulty = 1;
  else if (attempts < MIN_ATTEMPTS_FOR_HARD && difficulty > 2) difficulty = 2;

  return difficulty;
}

/**
 * Division remains its own BKT skill. Multiplication and subtraction are used
 * only as readiness evidence because both procedures are prerequisites for
 * completing a long-division step.
 */
export function capDivisionDifficulty(
  proposed: 1 | 2 | 3,
  mastery: Record<string, number>,
  attempts: Record<string, number>
): 1 | 2 | 3 {
  const prerequisite = Math.min(
    mastery.Multiplication ?? INITIAL_MASTERY,
    mastery.Subtraction ?? INITIAL_MASTERY
  );
  const evidence = Math.min(attempts.Multiplication ?? 0, attempts.Subtraction ?? 0);

  if (prerequisite < 0.35 || evidence < 2) return 1;
  if (prerequisite < 0.65 || evidence < 5) return Math.min(proposed, 2) as 1 | 2;
  return proposed;
}

// ---- BKT Parameters by Difficulty ----

export interface AdjustedBktParams {
  pT: number;
  pG: number;
  pS: number;
}

/**
 * Parameters for a difficulty tier. Reads the single table in `bkt.defaults` —
 * this function used to hold its own hard-coded copy, so tuning one had no
 * effect on the other.
 */
export function getAdjustedParams(difficulty: 1 | 2 | 3): AdjustedBktParams {
  return BKT_PARAMS_BY_DIFFICULTY[difficulty];
}

// ---- Main Selection Logic ----

/** Keep the same bounded, per-player issuance history in the game state. */
export const RECENT_SKILL_HISTORY_LIMIT = 8;
const MAX_CONSECUTIVE_SKILL_ISSUANCES = 3;

export interface SelectionInput {
  masteryStates: Record<string, number>;
  context: ChallengeContext;
  consecutiveFailures: Record<string, number>;
  /** Observations per skill. Gates difficulty until the estimate has evidence. */
  skillAttempts?: Record<string, number>;
  /** Skill theme of the property in play. A preference, not a constraint. */
  propertySkillTheme?: SkillName;
  /** Force a skill. Used by the Math Duel so both players face the same one. */
  forceSkill?: SkillName;
  /** Fingerprints recently issued to this learner; used to avoid repetition. */
  recentQuestionFingerprints?: readonly string[];
  /** This player's recent issued skills, oldest first. Never shared across players. */
  recentSkillHistory?: readonly SkillName[];
  /** The last issued tier per skill; upward changes are limited to one tier. */
  previousDifficultyBySkill?: Partial<Record<SkillName, 1 | 2 | 3>>;
}

/**
 * How much a property's theme tilts selection toward its skill. A boost rather
 * than a filter: before Phase 4 a themed tile collapsed the candidate list to a
 * single skill, so BKT only ever chose the skill on Challenge Cards and Jail —
 * the board was making the decision, not the learner model.
 */
const THEME_BOOST = 1.5;

/**
 * Select the best math challenge for the current game context.
 *
 * Strategy:
 * 1. Get eligible skills from context
 * 2. Review overdue skills, otherwise weight weak and underexposed skills
 * 3. Determine difficulty from mastery with context adjustments
 * 4. Generate the question
 */
export function selectChallenge(input: SelectionInput): MathChallenge {
  const {
    masteryStates,
    context,
    consecutiveFailures,
    skillAttempts,
    propertySkillTheme,
    forceSkill,
    recentQuestionFingerprints,
    recentSkillHistory,
    previousDifficultyBySkill,
  } = input;

  // 1. Eligible skills for this context
  const eligibleSkills: readonly SkillName[] = CONTEXT_SKILL_MAP[context] || ACTIVE_SKILL_NAMES;

  // 2. Pick the skill. A themed property tilts the wheel toward its own skill
  //    without excluding the others.
  const selectedSkill: SkillName =
    forceSkill ??
    selectSkillWithHistory(
      masteryStates,
      eligibleSkills,
      recentSkillHistory ?? [],
      propertySkillTheme ? { skill: propertySkillTheme, factor: THEME_BOOST } : undefined
    );

  let difficulty = getDifficultyFromMastery(
    masteryStates[selectedSkill] ?? INITIAL_MASTERY,
    skillAttempts?.[selectedSkill] ?? 0
  );

  // Context-specific difficulty adjustments
  switch (context) {
    case 'JAIL_ESCAPE':
      // Reduce difficulty by 1 — jail is already a penalty
      difficulty = Math.max(1, difficulty - 1) as 1 | 2 | 3;
      break;
  }

  // Confidence-based override
  const skillFailures = consecutiveFailures[selectedSkill] ?? 0;
  if (skillFailures >= 2) {
    difficulty = 1; // Rebuild confidence after consecutive failures
  }

  if (selectedSkill === 'Division') {
    difficulty = capDivisionDifficulty(difficulty, masteryStates, skillAttempts ?? {});
  }

  const previousDifficulty = previousDifficultyBySkill?.[selectedSkill];
  if (previousDifficulty !== undefined) {
    difficulty = Math.min(difficulty, previousDifficulty + 1) as 1 | 2 | 3;
  }

  // 3. Generate the question using the selected skill and difficulty
  // Every game context uses the same vertical fill-in calculation bank.
  // Context changes the reward and difficulty, never the question format.
  const generated = generateDistinctQuestion(
    (): GeneratedQuestion => generateQuestion(selectedSkill, difficulty),
    recentQuestionFingerprints ?? []
  );

  return buildChallenge(generated, selectedSkill, difficulty, context);
}

// ---- Helpers ----

function buildChallenge(
  generated: GeneratedQuestion & { fingerprint: string },
  skill: SkillName,
  difficulty: 1 | 2 | 3,
  context: ChallengeContext
): MathChallenge {
  const id = `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    skillName: skill,
    difficulty,
    questionData: generated.questionData,
    text: generated.text,
    options: generated.options,
    correctIndex: generated.correctIndex,
    context,
    timeLimit: QUESTION_TIME_LIMITS[difficulty],
    startedAt: Date.now(),
    fingerprint: generated.fingerprint,
  };
}

/**
 * Roulette-wheel skill selection, weighted by `(1 − pL)²`.
 *
 * The previous implementation was named "weighted random" but scored every skill
 * and always took the highest, so the weakest skill won almost every draw. A
 * child could be buried in their worst subject for a whole session, and two
 * close skills would lock onto one of them.
 *
 * Squaring the gap keeps a strong preference for weak skills while leaving every
 * eligible skill a real chance. `MIN_WEIGHT` means even a mastered skill
 * resurfaces occasionally, which is what makes retention visible in the data.
 */
const MIN_WEIGHT = 0.08;

/**
 * Adaptive picks review skills absent from the last eight issuances before a
 * weighted draw. Ties prefer lower mastery. With four eligible skills and no
 * forced selections, each skill is consequently issued within eleven picks.
 * Forced duel selections remain explicit and may bypass these pacing guards.
 */
function selectSkillWithHistory(
  masteryStates: Record<string, number>,
  eligibleSkills: readonly SkillName[],
  history: readonly SkillName[],
  boost?: { skill: SkillName; factor: number }
): SkillName {
  const recent = history.slice(-RECENT_SKILL_HISTORY_LIMIT);
  if (recent.length === RECENT_SKILL_HISTORY_LIMIT) {
    const overdue = eligibleSkills.filter((skill) => !recent.includes(skill));
    if (overdue.length > 0) {
      return overdue.reduce((selected, skill) => {
        const selectedLast = history.lastIndexOf(selected);
        const skillLast = history.lastIndexOf(skill);
        if (skillLast < selectedLast) return skill;
        if (skillLast > selectedLast) return selected;
        return (masteryStates[skill] ?? INITIAL_MASTERY) <
          (masteryStates[selected] ?? INITIAL_MASTERY) ? skill : selected;
      });
    }
  }

  const last = recent[recent.length - 1];
  const repeated = recent.length >= MAX_CONSECUTIVE_SKILL_ISSUANCES &&
    recent.slice(-MAX_CONSECUTIVE_SKILL_ISSUANCES).every((skill) => skill === last);
  const candidates = repeated && eligibleSkills.length > 1
    ? eligibleSkills.filter((skill) => skill !== last)
    : eligibleSkills;
  return selectSkillWeighted(masteryStates, candidates, boost, recent);
}

function selectSkillWeighted(
  masteryStates: Record<string, number>,
  eligibleSkills: readonly SkillName[],
  boost?: { skill: SkillName; factor: number },
  recent: readonly SkillName[] = []
): SkillName {
  if (eligibleSkills.length === 1) return eligibleSkills[0];

  const weights = eligibleSkills.map((skill) => {
    const mastery = masteryStates[skill] ?? INITIAL_MASTERY;
    const base = (1 - mastery) ** 2;
    const weighted = boost && skill === boost.skill ? base * boost.factor : base;
    const recentCount = recent.filter((issued) => issued === skill).length;
    const exposureBoost = 1 + (recent.length - recentCount) / RECENT_SKILL_HISTORY_LIMIT;
    return Math.max(weighted, MIN_WEIGHT) * exposureBoost;
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let ticket = Math.random() * total;

  for (let i = 0; i < eligibleSkills.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return eligibleSkills[i];
  }

  return eligibleSkills[eligibleSkills.length - 1];
}
