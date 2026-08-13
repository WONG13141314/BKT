// ============================================
// BKT Question Selector
// 4 Skills: Addition, Subtraction, Multiplication, Division
// Picks the skill, the difficulty and the hint level for a game context.
// ============================================

import {
  ChallengeContext,
  ColumnQuestion,
  LongDivisionQuestion,
  MathChallenge,
  QuestionData,
} from '../features/game/game.types';
import { ACTIVE_SKILL_NAMES as SKILL_NAMES, BANK_OFFER_TIME_LIMIT, DUEL_TIME_LIMIT, SkillName } from '../features/game/game.constants';
import {
  generateQuestion,
  generateSmartBuyQuestion,
} from './question.generator';
import { BKT_PARAMS_BY_DIFFICULTY, INITIAL_MASTERY } from './bkt.defaults';

// ---- Context-to-Skill Mapping ----

const CONTEXT_SKILL_MAP: Record<ChallengeContext, readonly SkillName[]> = {
  ROLL_CHALLENGE: SKILL_NAMES,                            // The turn toll — fully BKT-driven
  MATH_DUEL: SKILL_NAMES,                                 // Themed by the disputed property
  SMART_BUY: ['Subtraction', 'Multiplication'],           // Price calculations
  CHALLENGE_CARD: SKILL_NAMES,                            // All skills eligible
  JAIL_ESCAPE: SKILL_NAMES,                               // All, reduced difficulty
  LEVEL_UP: SKILL_NAMES,                                  // Matched to property skill theme
};

// The submitted Standard 1 study evaluates addition and subtraction only.
// Keep the dormant generators compiled, but never select them in live play.
CONTEXT_SKILL_MAP.SMART_BUY = SKILL_NAMES;

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

/** Below this many observations on a skill, difficulty 2 is the ceiling. */
const MIN_ATTEMPTS_FOR_MEDIUM = 2;
/** Below this many, difficulty 3 stays locked however high P(L) has climbed. */
const MIN_ATTEMPTS_FOR_HARD = 5;

function getDifficultyFromMastery(pMastery: number, attempts: number): 1 | 2 | 3 {
  let difficulty: 1 | 2 | 3 = pMastery < BAND_MEDIUM ? 1 : pMastery < BAND_HARD ? 2 : 3;

  if (attempts < MIN_ATTEMPTS_FOR_MEDIUM) difficulty = 1;
  else if (attempts < MIN_ATTEMPTS_FOR_HARD && difficulty > 2) difficulty = 2;

  return difficulty;
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

// ---- Hint Determination ----

export interface HintInfo {
  level: 0 | 1 | 2 | 3;
  content: string | null;
}

/**
 * Scaffolding for the specific thing the player has to supply.
 *
 * These used to be three fixed sentences that never mentioned the question —
 * "Try breaking this problem into smaller steps" is no help to a child stuck on
 * a carry. Each hint now names the column, row or step in front of them, and
 * escalates from a nudge to a worked instruction as failures accumulate.
 */
export function determineHint(
  consecutiveFailures: number,
  pMastery: number,
  skillName: string,
  question?: QuestionData
): HintInfo {
  const level: 0 | 1 | 2 | 3 =
    consecutiveFailures >= 3 || pMastery < 0.15 ? 3 : consecutiveFailures >= 2 ? 2 : consecutiveFailures >= 1 ? 1 : 0;

  if (level === 0) return { level: 0, content: null };

  return { level, content: hintFor(level, skillName, question) };
}

function hintFor(level: 1 | 2 | 3, skillName: string, question?: QuestionData): string {
  if (question?.type === 'column') return columnHint(level, question);
  if (question?.type === 'long_division') return divisionHint(level, question);

  // MCQ or no question data — fall back to something skill-specific.
  return level >= 3
    ? `Work it out step by step. ${skillName} is about doing one part at a time.`
    : `Take your time and check each part of the ${skillName.toLowerCase()}.`;
}

const PLACE_LABEL: Record<string, string> = {
  ones: 'ones',
  tens: 'tens',
  hundreds: 'hundreds',
};

function columnHint(level: 1 | 2 | 3, q: ColumnQuestion): string {
  const verb = q.operation === '+' ? 'add' : q.operation === '-' ? 'subtract' : 'multiply';

  // A missing digit inside the working: name the exact column.
  if (q.missingPosition === 'internal_digit' || q.missingDigitPlace) {
    const place = PLACE_LABEL[q.missingDigitPlace ?? 'ones'] ?? 'ones';
    if (level === 1) return `Look at the ${place} column only.`;
    if (level === 2) return `Cover the other columns. What must go in the ${place} place to make it work?`;
    return `Work backwards: use the answer's ${place} digit to find the missing one.`;
  }

  // A missing operand: the child has to undo the operation.
  if (q.missingPosition === 'top_operand' || q.missingPosition === 'bottom_operand') {
    if (level === 1) return `You know the answer — work backwards to find the missing number.`;
    if (level === 2) return `Start from the ones column and ask what you would ${verb} to get that digit.`;
    return `Go column by column from the right, filling in one digit at a time.`;
  }

  // The final answer.
  if (level === 1) return `Start with the ones column, on the right.`;

  if (q.operation === '-') {
    return level === 2
      ? `Check each column: if the top digit is smaller, you need to borrow.`
      : `Go right to left. When the top digit is smaller than the bottom one, borrow 10 from the next column first.`;
  }

  if (q.hasRegrouping) {
    return level === 2
      ? `Watch for a column that ${q.operation === '+' ? 'adds' : 'multiplies'} to more than 9 — that one carries.`
      : `Go right to left. When a column goes past 9, write the ones digit and carry the ten into the next column.`;
  }

  return level === 2
    ? `Take one column at a time, right to left.`
    : `Line the digits up and ${verb} each column separately, starting from the ones.`;
}

function divisionHint(level: 1 | 2 | 3, q: LongDivisionQuestion): string {
  const step = q.missingStepIndex + 1;

  switch (q.missingTarget) {
    case 'quotient_digit':
      return level === 1
        ? `How many times does ${q.divisor} fit in, without going over?`
        : `Count up in ${q.divisor}s until you get as close as you can without passing the number above.`;
    case 'product':
      return level === 1
        ? `Multiply ${q.divisor} by the digit you just wrote on top.`
        : `Take the quotient digit above this step and multiply it by ${q.divisor}. That is what you subtract.`;
    case 'subtraction_result':
      return level === 1
        ? `Subtract to find what is left over at step ${step}.`
        : `Take the number underneath away from the one above it, just like a normal subtraction.`;
    case 'remainder':
      return level === 1
        ? `What is left at the very end, after the last subtraction?`
        : `The remainder is whatever is left over, and it is always smaller than ${q.divisor}.`;
    default:
      return `Work down one step at a time.`;
  }
}

// ---- Main Selection Logic ----

export interface SelectionInput {
  masteryStates: Record<string, number>;
  context: ChallengeContext;
  consecutiveFailures: Record<string, number>;
  /** Observations per skill. Gates difficulty until the estimate has evidence. */
  skillAttempts?: Record<string, number>;
  // Smart Buy specific
  propertyPrice?: number;
  /** Skill theme of the property in play. A preference, not a constraint. */
  propertySkillTheme?: SkillName;
  /** Force a skill. Used by the Math Duel so both players face the same one. */
  forceSkill?: SkillName;
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
 * 2. Select via WEIGHTED RANDOM (lower mastery = higher weight + noise)
 * 3. Determine difficulty from mastery with context adjustments
 * 4. Generate the question
 * 5. Determine hint level
 */
export function selectChallenge(input: SelectionInput): MathChallenge {
  const {
    masteryStates,
    context,
    consecutiveFailures,
    skillAttempts,
    propertyPrice,
    propertySkillTheme,
    forceSkill,
  } = input;

  // 1. Eligible skills for this context
  const eligibleSkills: readonly SkillName[] = CONTEXT_SKILL_MAP[context] || SKILL_NAMES;

  // 2. Pick the skill. A themed property tilts the wheel toward its own skill
  //    without excluding the others.
  const selectedSkill: SkillName =
    forceSkill ??
    selectSkillWeighted(
      masteryStates,
      eligibleSkills,
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
    case 'LEVEL_UP':
      // Increase difficulty by 1 — boss challenge
      difficulty = Math.min(3, difficulty + 1) as 1 | 2 | 3;
      break;
  }

  // Confidence-based override
  const skillFailures = consecutiveFailures[selectedSkill] ?? 0;
  if (skillFailures >= 2) {
    difficulty = 1; // Rebuild confidence after consecutive failures
  }

  // 3. Generate the question using the selected skill and difficulty
  let generated;
  if (context === 'SMART_BUY' && propertyPrice != null) {
    generated = generateSmartBuyQuestion(propertyPrice, difficulty, selectedSkill);
  } else {
    generated = generateQuestion(selectedSkill, difficulty);
  }

  // 4. Determine the hint — after generation, so it can point at the actual
  //    column, row or division step the player has to fill in.
  const failures = consecutiveFailures[selectedSkill] ?? 0;
  const mastery = masteryStates[selectedSkill] ?? INITIAL_MASTERY;
  const hint = determineHint(failures, mastery, selectedSkill, generated.questionData);

  return buildChallenge(generated, selectedSkill, difficulty, context, hint);
}

// ---- Helpers ----

function buildChallenge(
  generated: { questionData: QuestionData; text: string; options: string[]; correctIndex: number },
  skill: SkillName,
  difficulty: 1 | 2 | 3,
  context: ChallengeContext,
  hint: HintInfo
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
    timeLimit: context === 'MATH_DUEL'
      ? DUEL_TIME_LIMIT
      : context === 'SMART_BUY'
        ? BANK_OFFER_TIME_LIMIT
        : 0,
    startedAt: Date.now(),
    hintLevel: hint.level,
    hintContent: hint.content,
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
// With only the two proposal skills active, a larger floor prevents the weaker
// skill from occupying virtually every question while still strongly favouring it.
const MIN_WEIGHT = 0.08;

function selectSkillWeighted(
  masteryStates: Record<string, number>,
  eligibleSkills: readonly SkillName[],
  boost?: { skill: SkillName; factor: number }
): SkillName {
  if (eligibleSkills.length === 1) return eligibleSkills[0];

  const weights = eligibleSkills.map((skill) => {
    const mastery = masteryStates[skill] ?? INITIAL_MASTERY;
    const base = (1 - mastery) ** 2;
    const weighted = boost && skill === boost.skill ? base * boost.factor : base;
    return Math.max(weighted, MIN_WEIGHT);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let ticket = Math.random() * total;

  for (let i = 0; i < eligibleSkills.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return eligibleSkills[i];
  }

  return eligibleSkills[eligibleSkills.length - 1];
}
