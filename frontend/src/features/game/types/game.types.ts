// ============================================
// Game Types — Frontend (mirrors backend)
// 20-tile board, 4 skills (Std 1 KSSR), RM currency
// ============================================

// ---- Skill Names ----

export const SKILL_NAMES = [
  'Addition',
  'Subtraction',
  'Multiplication',
  'Division',
] as const;

export type SkillName = typeof SKILL_NAMES[number];

// ---- Constants ----

export const PRIMARY_MATH_LABEL = 'Primary Math';

export const QUESTION_TIME_LIMITS: Record<1 | 2 | 3, number> = {
  1: 25,
  2: 20,
  3: 15,
};

export const GAME_CONSTANTS = {
  TOTAL_TILES: 20,
  MAX_PLAYERS: 4,
  STARTING_MONEY: 800,
  GO_SALARY: 150,
  MAX_ROUNDS: 12,
  CLOCK_CAP_MINUTES: 18,
  TAX_AMOUNT: 50,
  LUXURY_TAX_AMOUNT: 75,
  BAIL_COST: 50,
  SMART_BUY_DISCOUNT: 0.20,
  LANDLORD_BONUS: 0,
  MAX_JAIL_TURNS: 2,
  QUESTION_TIME_LIMIT_EASY: QUESTION_TIME_LIMITS[1],
  QUESTION_TIME_LIMIT_MEDIUM: QUESTION_TIME_LIMITS[2],
  QUESTION_TIME_LIMIT_HARD: QUESTION_TIME_LIMITS[3],
  PRIMARY_MATH_LABEL,
} as const;

// ---- Board & Tiles ----

export type TileType =
  | 'GO'
  | 'PROPERTY'
  | 'CHALLENGE_CARD'
  | 'TAX'
  | 'LUCKY_BREAK'
  | 'REST'
  | 'JAIL'
  | 'GO_TO_JAIL';

export interface TileConfig {
  index: number;
  type: TileType;
  name: string;
  colorGroup: string | null;
  skillTheme: SkillName | null;
  price: number;
  baseRent: number;
  leveledRent: number;
}

export interface PropertyState {
  tileIndex: number;
  ownerId: string | null;
  isLeveledUp: boolean;
}

// ---- Color Group ----

/**
 * A colour set, for monopoly bonuses only. It deliberately carries no skill
 * theme: sets are pairs of adjacent tiles, and with 10 property tiles across 4
 * skills a set cannot always hold one skill. Each tile's own `skillTheme` is
 * the single source of truth.
 */
export interface ColorGroup {
  name: string;
  color: string;
  tileIndices: number[];
}

// ---- Players ----

export interface Player {
  id: string;
  playerId: string;
  name: string;
  position: number;
  money: number;
  color: string;
  tokenType: 'race_car' | 'battleship' | 'top_hat' | 'scottie_dog';
  properties: number[];
  isInJail: boolean;
  jailTurns: number;
  isBankrupt: boolean;
  streak: number;
  totalCorrect: number;
  totalQuestions: number;
  hasLevelUpToken: boolean;
  hasRentShield: boolean;
  hasDiscountToken: boolean;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

// ---- Turn Flow ----

export type TurnPhase =
  | 'ROLL_PHASE'
  | 'MOVING'
  | 'RESOLVE_TILE'
  | 'BUY_DECISION'
  | 'SMART_BUY_CHALLENGE'
  | 'MATH_DUEL'
  | 'CARD_DRAW'
  | 'CARD_MATH_CHALLENGE'
  | 'JAIL_DECISION'
  | 'JAIL_CHALLENGE'
  | 'END_TURN';

export type ChallengeContext =
  | 'MATH_DUEL'
  | 'SMART_BUY'
  | 'CHALLENGE_CARD'
  | 'JAIL_ESCAPE';

// ---- Question Data Models ----
//
// These mirror the server's *public* payloads. The full question — operands,
// answer, quotient, step results — never leaves the server, so the client only
// ever receives pre-laid-out cells. See backend `challenge.public.ts`.

/** One cell in a vertical layout: '' = blank, '?' = the value to supply, else a digit. */
export type DigitCell = string;

export type ColumnPlace = 'hundreds' | 'tens' | 'ones';

export interface ColumnQuestion {
  type: 'column';
  operation: '+' | '-' | '×';
  columns: ColumnPlace[];
  topCells: DigitCell[];
  bottomCells: DigitCell[];
  answerCells: DigitCell[];
  /** When a whole value is the target, that row renders as one wide '?' box. */
  hiddenRow: 'top' | 'bottom' | 'answer' | null;
  hasRegrouping: boolean;
}

export interface DivisionStep {
  productCells: DigitCell[];
  showMinus: boolean;
  lineFrom: number;
  lineTo: number;
  /** null = the work stops here; this row is not drawn. */
  resultCells: DigitCell[] | null;
}

export interface LongDivisionQuestion {
  type: 'long_division';
  divisor: number;
  dividendCells: DigitCell[];
  quotientCells: DigitCell[];
  steps: DivisionStep[];
  remainderCell: DigitCell | null;
}

export interface McqQuestion {
  type: 'mcq';
  text: string;
}

export type QuestionData = ColumnQuestion | LongDivisionQuestion | McqQuestion;

// ---- Math Challenge ----

export interface MathChallenge {
  id: string;
  questionData: QuestionData;
  options: string[];
  context: ChallengeContext;
  timeLimit: number;
  /** Unix ms. The countdown is driven by this, not by a client-side start time. */
  expiresAt: number;
  hintContent: string | null;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  reward: RewardResult;
  streakCount: number;
  streakBroken: boolean;
  /** True when the server auto-submitted because the timer ran out. */
  timedOut: boolean;
  showHintNext: boolean;
  feedback: string;
}

// ---- Tile Events ----

export interface TileEvent {
  type: TileType;
  tileIndex: number;
  tileName: string;
  propertyPrice?: number;
  propertyOwner?: string | null;
  rentAmount?: number;
  isMonopoly?: boolean;
  isLeveledUp?: boolean;
  bankOfferAttempted?: boolean;
  bankOfferApproved?: boolean;
  taxAmount?: number;
  card?: ChallengeCard;
  luckyBreakReward?: LuckyBreakReward;
}

export interface ChallengeCard {
  id: number;
  name: string;
  description: string;
  isMathCard: boolean;
  effect: CardEffect;
  correctReward?: CardEffect;
  wrongOutcome?: CardEffect;
}

export type CardEffect =
  | { type: 'GAIN_MONEY'; amount: number }
  | { type: 'LOSE_MONEY'; amount: number }
  | { type: 'MOVE_FORWARD'; spaces: number }
  | { type: 'MOVE_BACKWARD'; spaces: number }
  | { type: 'GO_TO_JAIL' }
  | { type: 'COLLECT_FROM_EACH'; amount: number }
  | { type: 'FREE_LEVEL_UP_TOKEN' }
  | { type: 'RENT_SHIELD' }
  | { type: 'DISCOUNT_TOKEN'; percent: number }
  | { type: 'STEAL_FROM_RICHEST'; amount: number }
  | { type: 'NOTHING' };

export interface LuckyBreakReward {
  type: 'cash' | 'levelUpToken';
  amount?: number;
}

// ---- Rewards ----

export interface RewardResult {
  type: RewardType;
  value: number;
  description: string;
}

export type RewardType =
  | 'DISCOUNT'
  | 'BONUS_CASH'
  | 'RENT_HALF'
  | 'LEVEL_UP'
  | 'JAIL_BREAK'
  | 'NONE';

// ---- Game State ----

export interface GameState {
  id: string;
  players: Player[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  turnPhase: TurnPhase;
  round: number;
  maxRounds: number;
  diceValues: [number, number];
  diceRollId: number;
  /** 1 after a failed Roll Challenge, 2 otherwise. `diceValues[1]` is 0 when 1. */
  diceCount: 1 | 2;
  currentChallenge: MathChallenge | null;
  pendingTileEvent: TileEvent | null;
  challengeCardDeck: number[];
  challengeCardIndex: number;
  gameStartTime: number;
  isFinalRound: boolean;
  phaseDeadline: number | null;
}

// ---- Math Duel ----
//
// Mirrors the server's *public* duel payload. Neither question travels with it:
// each duellist receives only their own, and only until they answer.

export type DuelOutcome = 'CHALLENGER_WINS' | 'OWNER_WINS' | 'DRAW_BOTH' | 'DRAW_NEITHER';

export interface DuelResolution {
  outcome: DuelOutcome;
  rentPaid: number;
  landlordBonus: number;
  challengerCorrect: boolean;
  ownerCorrect: boolean;
  headline: string;
}

export interface PublicDuelSide {
  playerId: string;
  hasAnswered: boolean;
  /** Stays null until the duel resolves — nobody sees a result early. */
  isCorrect: boolean | null;
}

export interface PublicDuelState {
  tileIndex: number;
  tileName: string;
  rentAmount: number;
  challenger: PublicDuelSide;
  owner: PublicDuelSide;
  resolution: DuelResolution | null;
}

// ---- Scoring ----

export interface FinalScore {
  playerId: string;
  playerName: string;
  color: string;
  isBot: boolean;
  cash: number;
  propertyValue: number;
  levelUpValue: number;
  netWorth: number;
  totalCorrect: number;
  totalQuestions: number;
  rank: number;
}

export interface MasteryReport {
  playerId: string;
  playerName: string;
  skills: {
    skillName: SkillName;
    mastery: number;
    totalAttempts: number;
    /** P(L) has passed the mastery threshold. */
    isMastered: boolean;
  }[];
  bestSkill: SkillName;
  weakestSkill: SkillName;
  overallAccuracy: number;
}

// ---- Currency Helper ----

export function formatRM(amount: number): string {
  return `RM${amount}`;
}
