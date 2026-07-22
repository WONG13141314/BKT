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
  DICE_CHALLENGE_BONUS: 20,
  SMART_BUY_DISCOUNT: 0.20,
  RENT_DEFENSE_DISCOUNT: 0.50,
  MAX_JAIL_TURNS: 2,
  QUESTION_TIME_LIMIT_EASY: 20,
  QUESTION_TIME_LIMIT_MEDIUM: 15,
  QUESTION_TIME_LIMIT_HARD: 12,
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

export interface ColorGroup {
  name: string;
  color: string;
  tileIndices: number[];
  skillTheme: SkillName;
}

// ---- Players ----

export interface Player {
  id: string;
  userId: string;
  name: string;
  position: number;
  money: number;
  color: string;
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
  masteryStates: Record<string, number>;
  consecutiveFailures: Record<string, number>;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

// ---- Turn Flow ----

export type TurnPhase =
  | 'ROLL_PHASE'
  | 'DICE_CHALLENGE'
  | 'MOVING'
  | 'RESOLVE_TILE'
  | 'BUY_DECISION'
  | 'SMART_BUY_CHALLENGE'
  | 'RENT_PAYMENT'
  | 'RENT_CHALLENGE'
  | 'CARD_DRAW'
  | 'CARD_MATH_CHALLENGE'
  | 'JAIL_DECISION'
  | 'JAIL_CHALLENGE'
  | 'LEVEL_UP_OFFER'
  | 'LEVEL_UP_CHALLENGE'
  | 'END_TURN';

export type ChallengeContext =
  | 'DICE_CHALLENGE'
  | 'SMART_BUY'
  | 'RENT_DEFENSE'
  | 'CHALLENGE_CARD'
  | 'JAIL_ESCAPE'
  | 'LEVEL_UP';

// ---- Question Data Models ----

export interface ColumnQuestion {
  type: 'column';
  operation: '+' | '-' | '×';
  topNumber: number;
  bottomNumber: number;
  placeValues: {
    hundreds?: { top: number | null; bottom: number | null };
    tens: { top: number; bottom: number };
    ones: { top: number; bottom: number };
  };
  answer: number;
  hasRegrouping: boolean;
  answerDigits: {
    hundreds?: number | null;
    tens: number;
    ones: number;
  };
  missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit';
  missingDigitPlace?: 'hundreds' | 'tens' | 'ones';
  missingDigitRow?: 'top' | 'bottom';
}

export interface LongDivisionStep {
  quotientDigit: number;
  product: number;
  subtractionResult: number;
  broughtDownDigit: number | null;
}

export interface LongDivisionQuestion {
  type: 'long_division';
  divisor: number;
  dividend: number;
  quotient: number;
  remainder: number;
  steps: LongDivisionStep[];
  missingTarget: 'quotient_digit' | 'brought_down_digit' | 'subtraction_result' | 'remainder';
  missingStepIndex?: number;
}

export interface McqQuestion {
  type: 'mcq';
  text: string;
}

export type QuestionData = ColumnQuestion | LongDivisionQuestion | McqQuestion;

// ---- Math Challenge ----

export interface MathChallenge {
  id: string;
  skillName: SkillName;
  difficulty: 1 | 2 | 3;
  questionData: QuestionData;
  text: string;
  options: string[];
  correctIndex: number;
  context: ChallengeContext;
  timeLimit: number;
  hintLevel: 0 | 1 | 2 | 3;
  hintContent: string | null;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  newMastery: number;
  previousMastery: number;
  reward: RewardResult;
  streakCount: number;
  streakBroken: boolean;
  showHintNext: boolean;
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
  currentChallenge: MathChallenge | null;
  pendingTileEvent: TileEvent | null;
  challengeCardDeck: number[];
  challengeCardIndex: number;
  gameStartTime: number;
  isFinalRound: boolean;
  auctionState: AuctionState | null;
}

export interface AuctionState {
  tileIndex: number;
  currentBid: number;
  currentBidderId: string | null;
  timeRemaining: number;
  isActive: boolean;
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
    totalCorrect: number;
  }[];
  bestSkill: SkillName;
  weakestSkill: SkillName;
  overallAccuracy: number;
}

// ---- Currency Helper ----

export function formatRM(amount: number): string {
  return `RM${amount}`;
}
