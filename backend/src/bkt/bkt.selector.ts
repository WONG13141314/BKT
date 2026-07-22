// ============================================
// BKT Question Selector — Redesigned
// 4 Skills: Addition, Subtraction, PlaceValue, Money
// New challenge contexts matching the redesigned turn flow
// ============================================

import { ChallengeContext, MathChallenge, QuestionData } from '../features/game/game.types';
import { SKILL_NAMES, SkillName, TIME_LIMIT_EASY, TIME_LIMIT_MEDIUM, TIME_LIMIT_HARD } from '../features/game/game.constants';
import {
  generateQuestion,
  generateDiceChallenge,
  generateSmartBuyQuestion,
  generateRentDefenseQuestion,
} from './question.generator';

// ---- Context-to-Skill Mapping ----

const CONTEXT_SKILL_MAP: Record<ChallengeContext, readonly SkillName[]> = {
  DICE_CHALLENGE: ['Addition', 'Subtraction'],            // Uses dice values
  SMART_BUY: ['Subtraction', 'Multiplication'],           // Price calculations
  RENT_DEFENSE: ['Subtraction', 'Division'],             // Rent halving
  CHALLENGE_CARD: SKILL_NAMES,                            // All skills eligible
  JAIL_ESCAPE: SKILL_NAMES,                               // All, reduced difficulty
  LEVEL_UP: SKILL_NAMES,                                  // Matched to property skill theme
};

// ---- Difficulty from Mastery ----

function getDifficultyFromMastery(pMastery: number): 1 | 2 | 3 {
  if (pMastery < 0.40) return 1;   // Easy (P(L) < 0.40)
  if (pMastery < 0.75) return 2;   // Medium (0.40 <= P(L) < 0.75)
  return 3;                        // Hard (P(L) >= 0.75)
}

// ---- BKT Parameters by Difficulty ----

export interface AdjustedBktParams {
  pL0: number;
  pT: number;
  pG: number;
  pS: number;
}

export function getAdjustedParams(difficulty: 1 | 2 | 3): AdjustedBktParams {
  switch (difficulty) {
    case 1:
      return { pL0: 0.10, pT: 0.20, pG: 0.30, pS: 0.05 };  // High guess for young kids
    case 2:
      return { pL0: 0.10, pT: 0.15, pG: 0.25, pS: 0.10 };
    case 3:
      return { pL0: 0.10, pT: 0.10, pG: 0.20, pS: 0.15 };
  }
}

// ---- Hint Determination ----

export interface HintInfo {
  level: 0 | 1 | 2 | 3;
  content: string | null;
}

export function determineHint(
  consecutiveFailures: number,
  pMastery: number,
  skillName: string
): HintInfo {
  if (consecutiveFailures >= 3 || pMastery < 0.15) {
    return {
      level: 3,
      content: `💡 Let's work through an example together! Take your time with ${skillName}.`,
    };
  }
  if (consecutiveFailures >= 2) {
    return {
      level: 2,
      content: `💡 Hint: Try breaking this problem into smaller steps!`,
    };
  }
  if (consecutiveFailures >= 1) {
    return {
      level: 1,
      content: `💡 You can do this! Think carefully about ${skillName}.`,
    };
  }
  return { level: 0, content: null };
}

// ---- Main Selection Logic ----

export interface SelectionInput {
  masteryStates: Record<string, number>;
  context: ChallengeContext;
  consecutiveFailures: Record<string, number>;
  // Dice challenge specific
  diceValues?: [number, number];
  // Smart Buy specific
  propertyPrice?: number;
  // Rent Defense specific
  rentAmount?: number;
  // Level Up specific — skill theme of the property being leveled
  propertySkillTheme?: SkillName;
}

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
    diceValues,
    propertyPrice,
    rentAmount,
    propertySkillTheme,
  } = input;

  // 1. Get eligible skills
  let eligibleSkills: readonly SkillName[] = CONTEXT_SKILL_MAP[context] || SKILL_NAMES;

  // Prefer property's skill theme if provided (e.g., SMART_BUY, RENT_DEFENSE, LEVEL_UP)
  if (propertySkillTheme) {
    eligibleSkills = [propertySkillTheme];
  }

  // 2. Select skill via weighted random
  let selectedSkill: SkillName;
  let difficulty: 1 | 2 | 3;

  // Special case: DICE_CHALLENGE uses dice values directly
  if (context === 'DICE_CHALLENGE' && diceValues) {
    const generated = generateDiceChallenge(diceValues[0], diceValues[1], 1);
    selectedSkill = generated.skillName as SkillName;
    difficulty = 1; // Dice challenges are always easy

    const failures = consecutiveFailures[selectedSkill] ?? 0;
    const mastery = masteryStates[selectedSkill] ?? 0.1;
    const hint = determineHint(failures, mastery, selectedSkill);

    return buildChallenge(generated, selectedSkill, difficulty, context, hint);
  }

  // Weighted random selection (lower mastery = higher weight)
  selectedSkill = selectWeightedRandom(masteryStates, eligibleSkills);
  difficulty = getDifficultyFromMastery(masteryStates[selectedSkill] ?? 0.1);

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
  } else if (context === 'RENT_DEFENSE' && rentAmount != null) {
    generated = generateRentDefenseQuestion(rentAmount, difficulty, selectedSkill);
  } else {
    generated = generateQuestion(selectedSkill, difficulty);
  }

  // 4. Determine hint
  const failures = consecutiveFailures[selectedSkill] ?? 0;
  const mastery = masteryStates[selectedSkill] ?? 0.1;
  const hint = determineHint(failures, mastery, selectedSkill);

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
    timeLimit: getTimeLimit(difficulty),
    hintLevel: hint.level,
    hintContent: hint.content,
  };
}

/**
 * Weighted random skill selection.
 * Weight = (1 - pL) × random noise [0.7, 1.3]
 * Lower mastery = higher chance of being picked.
 */
function selectWeightedRandom(
  masteryStates: Record<string, number>,
  eligibleSkills: readonly SkillName[]
): SkillName {
  if (eligibleSkills.length === 1) return eligibleSkills[0];

  let bestSkill = eligibleSkills[0];
  let bestWeight = -1;

  for (const skill of eligibleSkills) {
    const mastery = masteryStates[skill] ?? 0.1;
    const weight = (1 - mastery) * (0.7 + Math.random() * 0.6); // noise [0.7, 1.3]
    if (weight > bestWeight) {
      bestWeight = weight;
      bestSkill = skill;
    }
  }

  return bestSkill;
}

function getTimeLimit(difficulty: 1 | 2 | 3): number {
  switch (difficulty) {
    case 1: return TIME_LIMIT_EASY;
    case 2: return TIME_LIMIT_MEDIUM;
    case 3: return TIME_LIMIT_HARD;
  }
}
