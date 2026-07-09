// ============================================
// BKT Question Selector
// Selects questions adaptively based on player mastery and game context
// ============================================

import { ChallengeContext, MathChallenge, SKILL_NAMES, SkillName } from '../features/game/game.types';
import { generateQuestion, generateBuyPropertyQuestion, generateRentQuestion, generateTaxQuestion, generateBuildHouseQuestion } from './question.generator';

// ---- Context-to-Skill Mapping ----
// Maps each game context to the skills that are most relevant

const CONTEXT_SKILL_MAP: Record<ChallengeContext, SkillName[]> = {
  ROLL_DICE: [...SKILL_NAMES],               // Any skill — will pick weakest
  BUY_PROPERTY: ['Subtraction', 'Addition'],
  PAY_RENT: ['Multiplication', 'Division'],
  BUILD_HOUSE: ['Multiplication', 'Addition'],
  BUILD_HOTEL: ['Multiplication', 'Subtraction'],
  CHANCE_CARD: [...SKILL_NAMES],              // Varies by card
  COMMUNITY_CHEST: [...SKILL_NAMES],          // Most recent failed skill
  TAX: ['Decimals', 'Division'],
  JAIL_ESCAPE: [...SKILL_NAMES],              // Weakest skill, reduced difficulty
  PASSING_GO: [...SKILL_NAMES],               // Skill closest to milestone
  FREE_PARKING: [...SKILL_NAMES],             // Mix of skills
  TRADE: ['Addition', 'Subtraction'],
  AUCTION: [...SKILL_NAMES],                  // Random
  SPECIAL_EVENT: [...SKILL_NAMES],
  MATH_DUEL: ['Multiplication', 'Division'],
  RECOVERY: [...SKILL_NAMES],                 // Weakest skill, easier
};

// ---- Difficulty Thresholds ----

function getDifficultyFromMastery(pMastery: number): 1 | 2 | 3 {
  if (pMastery < 0.3) return 1;   // Easy — build confidence
  if (pMastery <= 0.6) return 2;  // Medium — standard practice
  return 3;                        // Hard — challenge and push mastery
}

// ---- BKT Parameters Adjusted by Difficulty ----
// Higher difficulty = higher slip chance, lower transition rate

export interface AdjustedBktParams {
  pL0: number;
  pT: number;   // Transition (learning) probability
  pG: number;   // Guess probability
  pS: number;   // Slip probability
}

export function getAdjustedParams(difficulty: 1 | 2 | 3): AdjustedBktParams {
  switch (difficulty) {
    case 1:
      return { pL0: 0.1, pT: 0.20, pG: 0.25, pS: 0.05 };
    case 2:
      return { pL0: 0.1, pT: 0.15, pG: 0.25, pS: 0.10 };
    case 3:
      return { pL0: 0.1, pT: 0.10, pG: 0.25, pS: 0.15 };
  }
}

// ---- Hint Determination ----

export interface HintInfo {
  level: 0 | 1 | 2 | 3;
  content: string | null;
}

/**
 * Determine if a hint should be shown based on consecutive failures
 */
export function determineHint(
  consecutiveFailures: number,
  pMastery: number,
  skillName: string
): HintInfo {
  if (pMastery < 0.15) {
    // Critical: show worked example
    return {
      level: 3,
      content: `💡 Let's work through an example together! Take your time with ${skillName}.`,
    };
  }
  if (consecutiveFailures >= 3) {
    // Show simplified version
    return {
      level: 2,
      content: `💡 Hint: Try breaking this problem into smaller steps!`,
    };
  }
  if (consecutiveFailures >= 2) {
    // Show visual clue
    return {
      level: 1,
      content: `💡 Tip: Think about what you know about ${skillName}. You can do this!`,
    };
  }
  return { level: 0, content: null };
}

// ---- Main Selection Logic ----

export interface SelectionInput {
  masteryStates: Record<string, number>;   // skillName → pMastery
  context: ChallengeContext;
  consecutiveFailures: Record<string, number>; // skillName → failures in a row
  recentlySeenSkills: string[];            // Skills used in last few turns
  // Contextual data for specialized question generation
  playerMoney?: number;
  propertyPrice?: number;
  rentBase?: number;
  rentHouses?: number;
  taxTotalAssets?: number;
  taxType?: 'INCOME' | 'LUXURY';
  houseCost?: number;
  numHouses?: number;
}

/**
 * Select the best math challenge for the current game context and player state.
 *
 * Strategy:
 * 1. Get eligible skills from context mapping
 * 2. Prefer the weakest mastery skill (most benefit from practice)
 * 3. Avoid recently-seen skills for variety (soft preference, not hard rule)
 * 4. For jail, reduce difficulty by 1 level (jail is already a penalty)
 * 5. For free parking, choose a mix
 * 6. For passing GO, choose the skill closest to next milestone
 * 7. For recovery, pick weakest and drop difficulty
 */
export function selectChallenge(input: SelectionInput): MathChallenge {
  const {
    masteryStates,
    context,
    consecutiveFailures,
    playerMoney,
    propertyPrice,
    rentBase,
    rentHouses,
    taxTotalAssets,
    taxType,
    houseCost,
    numHouses,
  } = input;

  // 1. Get eligible skills for this context
  const eligibleSkills = CONTEXT_SKILL_MAP[context] || [...SKILL_NAMES];

  // 2. Select skill based on context strategy
  let selectedSkill: SkillName;
  let difficulty: 1 | 2 | 3;

  switch (context) {
    case 'PASSING_GO': {
      // Pick skill closest to the next milestone (0.5, 0.7, 0.9)
      selectedSkill = findSkillNearestMilestone(masteryStates, eligibleSkills);
      difficulty = getDifficultyFromMastery(masteryStates[selectedSkill] ?? 0.1);
      break;
    }
    case 'JAIL_ESCAPE':
    case 'RECOVERY': {
      // Pick weakest skill but reduce difficulty by 1
      selectedSkill = findWeakestSkill(masteryStates, eligibleSkills);
      const baseDifficulty = getDifficultyFromMastery(masteryStates[selectedSkill] ?? 0.1);
      difficulty = Math.max(1, baseDifficulty - 1) as 1 | 2 | 3;
      break;
    }
    default: {
      // Default: pick weakest eligible skill
      selectedSkill = findWeakestSkill(masteryStates, eligibleSkills);
      difficulty = getDifficultyFromMastery(masteryStates[selectedSkill] ?? 0.1);
      break;
    }
  }

  // 3. Determine hint
  const failures = consecutiveFailures[selectedSkill] ?? 0;
  const mastery = masteryStates[selectedSkill] ?? 0.1;
  const hint = determineHint(failures, mastery, selectedSkill);

  // 4. Generate the question (contextual or generic)
  let generated;

  switch (context) {
    case 'BUY_PROPERTY':
      if (playerMoney != null && propertyPrice != null) {
        generated = generateBuyPropertyQuestion(playerMoney, propertyPrice, difficulty);
      } else {
        generated = generateQuestion(selectedSkill, difficulty);
      }
      break;
    case 'PAY_RENT':
    case 'MATH_DUEL':
      if (rentBase != null && rentHouses != null) {
        generated = generateRentQuestion(rentBase, rentHouses, difficulty);
      } else {
        generated = generateQuestion(selectedSkill, difficulty);
      }
      break;
    case 'TAX':
      if (taxTotalAssets != null && taxType != null) {
        generated = generateTaxQuestion(taxTotalAssets, taxType, difficulty);
      } else {
        generated = generateQuestion(selectedSkill, difficulty);
      }
      break;
    case 'BUILD_HOUSE':
    case 'BUILD_HOTEL':
      if (houseCost != null && numHouses != null) {
        generated = generateBuildHouseQuestion(houseCost, numHouses, difficulty);
      } else {
        generated = generateQuestion(selectedSkill, difficulty);
      }
      break;
    default:
      generated = generateQuestion(selectedSkill, difficulty);
      break;
  }

  // 5. Build the MathChallenge object
  const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: challengeId,
    questionId: challengeId, // Will be replaced with actual DB id if using stored questions
    skillId: selectedSkill,
    skillName: selectedSkill,
    difficulty,
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
 * Select multiple challenges for Free Parking bonus round
 */
export function selectFreeParkingChallenges(
  masteryStates: Record<string, number>,
  consecutiveFailures: Record<string, number>
): MathChallenge[] {
  const skills = Object.entries(masteryStates).sort(([, a], [, b]) => a - b);
  const weakestSkill = skills[0]?.[0] || 'Addition';
  const strongestSkill = skills[skills.length - 1]?.[0] || 'Multiplication';
  const allSkills = Object.keys(masteryStates);
  const randomSkill = allSkills[Math.floor(Math.random() * allSkills.length)] || 'Division';

  const challengeSkills = [weakestSkill, strongestSkill, randomSkill];

  return challengeSkills.map((skill) =>
    selectChallenge({
      masteryStates,
      context: 'FREE_PARKING',
      consecutiveFailures,
      recentlySeenSkills: [],
    })
  );
}

// ---- Helper Functions ----

function findWeakestSkill(
  masteryStates: Record<string, number>,
  eligibleSkills: SkillName[]
): SkillName {
  let weakest: SkillName = eligibleSkills[0];
  let lowestMastery = Infinity;

  for (const skill of eligibleSkills) {
    const mastery = masteryStates[skill] ?? 0.1;
    if (mastery < lowestMastery) {
      lowestMastery = mastery;
      weakest = skill;
    }
  }

  return weakest;
}

function findSkillNearestMilestone(
  masteryStates: Record<string, number>,
  eligibleSkills: SkillName[]
): SkillName {
  const milestones = [0.5, 0.7, 0.9];
  let nearest: SkillName = eligibleSkills[0];
  let smallestGap = Infinity;

  for (const skill of eligibleSkills) {
    const mastery = masteryStates[skill] ?? 0.1;
    for (const milestone of milestones) {
      if (mastery < milestone) {
        const gap = milestone - mastery;
        if (gap < smallestGap) {
          smallestGap = gap;
          nearest = skill;
        }
        break; // Only check next milestone above current mastery
      }
    }
  }

  return nearest;
}

function getTimeLimit(difficulty: 1 | 2 | 3): number {
  switch (difficulty) {
    case 1: return 20; // Easy: 20 seconds
    case 2: return 15; // Medium: 15 seconds
    case 3: return 12; // Hard: 12 seconds
  }
}
