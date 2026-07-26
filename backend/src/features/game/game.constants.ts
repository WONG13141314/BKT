// ============================================
// Game Constants — All tunable values in one place
// Currency: RM (Malaysian Ringgit)
// Scope: Standard 1 KSSR only
// ============================================

// ---- Board ----

export const TOTAL_TILES = 20;
export const MAX_PLAYERS = 4;
export const TILES_PER_SIDE = 5; // 5 tiles per side including corners

// ---- Economy (all RM) ----

export const STARTING_MONEY = 800;
export const GO_SALARY = 150;
export const TAX_AMOUNT = 50;
export const LUXURY_TAX_AMOUNT = 75;
export const BAIL_COST = 50;
export const LEVEL_UP_COST_RATIO = 0.50; // 50% of property price
export const MONOPOLY_RENT_MULTIPLIER = 2; // 2× base rent when owning full set

// ---- Math Rewards ----

export const ROLL_CHALLENGE_BONUS = 20;       // RM20 for winning your two dice
export const SMART_BUY_DISCOUNT = 0.20;        // 20% off property price

// ---- Math Duel ----
// Landing on an owned property disputes it with the owner. Both answer at once.
// The challenger's stake is the rent; the owner's reward comes from the bank, so
// winning a duel never takes extra money from the other child.

export const DUEL_TIME_LIMIT = 20;             // Seconds, shared by both duellists
export const LANDLORD_BONUS = 20;              // RM20 from the bank for a correct owner
export const DUEL_DRAW_RENT_RATIO = 0.50;      // Both correct → challenger pays half

// ---- Pacing ----

export const MAX_ROUNDS = 12;                  // 12 turns per player
export const CLOCK_CAP_MINUTES = 18;           // Wall-clock soft cap

// ---- Jail ----

export const MAX_JAIL_TURNS = 2; // Auto-release after 2 turns (not 3)

// ---- Challenge Cards ----

export const TOTAL_CARDS = 12;
export const LUCK_CARDS_COUNT = 7;
export const MATH_CARDS_COUNT = 5;

// ---- Question Timing ----

export const TIME_LIMIT_EASY = 20;    // seconds
export const TIME_LIMIT_MEDIUM = 15;
export const TIME_LIMIT_HARD = 12;

// ---- Lucky Break Rewards ----

export const LUCKY_BREAK_CASH_OPTIONS = [30, 50] as const; // RM amounts
export const LUCKY_BREAK_TOKEN_CHANCE = 0.33; // 1 in 3 chance of free Level Up token

// ---- Scoring ----
// Winner = highest net worth (cash + property values + level-up bonuses)
// No mastery multiplier in game score

// ---- Skill Nodes (Standard 1 KSSR) ----

export const SKILL_NAMES = [
  'Addition',
  'Subtraction',
  'Multiplication',
  'Division',
] as const;

export type SkillName = typeof SKILL_NAMES[number];

// ---- Currency Formatting ----

export function formatRM(amount: number): string {
  return `RM${amount}`;
}

// ---- Aggregate Export ----

export const GAME_CONSTANTS = {
  TOTAL_TILES,
  MAX_PLAYERS,
  STARTING_MONEY,
  GO_SALARY,
  TAX_AMOUNT,
  LUXURY_TAX_AMOUNT,
  BAIL_COST,
  LEVEL_UP_COST_RATIO,
  MONOPOLY_RENT_MULTIPLIER,
  ROLL_CHALLENGE_BONUS,
  SMART_BUY_DISCOUNT,
  DUEL_TIME_LIMIT,
  LANDLORD_BONUS,
  MAX_ROUNDS,
  CLOCK_CAP_MINUTES,
  MAX_JAIL_TURNS,
  TOTAL_CARDS,
  LUCK_CARDS_COUNT,
  MATH_CARDS_COUNT,
  TIME_LIMIT_EASY,
  TIME_LIMIT_MEDIUM,
  TIME_LIMIT_HARD,
} as const;
