// ============================================
// Game Engine Types — MathOpoly Redesign
// 20-tile board, 4 skills (Std 1 KSSR), RM currency
// ============================================

import { SKILL_NAMES, type SkillName } from './game.constants';

// Re-export for convenience
export { SKILL_NAMES, type SkillName };

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
  colorGroup: string | null;   // e.g. 'blue', 'orange', null for non-properties
  skillTheme: SkillName | null; // Which skill this property tests
  price: number;                // Purchase price in RM (0 for non-properties)
  baseRent: number;             // Base rent in RM (0 for non-properties)
  leveledRent: number;          // Rent after Level Up (0 for non-properties)
}

export interface PropertyState {
  tileIndex: number;
  ownerId: string | null;       // Player id
  isLeveledUp: boolean;         // Single level-up replaces houses/hotels
}

// ---- Color Groups ----

export interface ColorGroup {
  name: string;
  color: string;                // CSS hex color
  tileIndices: number[];        // Which tile indices belong to this group
  skillTheme: SkillName;        // Primary skill for this color set
}

// ---- Players ----

export interface PlayerState {
  id: string;
  userId: string;
  name: string;
  position: number;             // Tile index (0–19)
  money: number;                // In RM
  color: string;                // CSS color
  properties: number[];         // Tile indices owned
  isInJail: boolean;
  jailTurns: number;            // 0–2
  isBankrupt: boolean;
  streak: number;               // Consecutive correct answers
  totalCorrect: number;
  totalQuestions: number;
  hasLevelUpToken: boolean;     // Free token from Lucky Break / challenge card
  hasRentShield: boolean;       // Skip next rent payment (from challenge card)
  hasDiscountToken: boolean;    // 30% off next purchase (from challenge card)
  masteryStates: Record<string, number>; // skillName → pMastery [0.01, 0.99]
  consecutiveFailures: Record<string, number>; // skillName → consecutive wrong count

  // Bot-specific
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

// ---- Turn Flow (State Machine) ----

export type TurnPhase =
  | 'ROLL_PHASE'            // Waiting for player to roll dice
  | 'DICE_CHALLENGE'        // Optional dice mini-challenge (1-in-3)
  | 'MOVING'                // Token animation in progress
  | 'RESOLVE_TILE'          // Processing tile landing
  | 'BUY_DECISION'          // Player choosing to buy / smart-buy / skip
  | 'SMART_BUY_CHALLENGE'   // Answering Smart Buy question
  | 'RENT_PAYMENT'          // Player choosing to defend or pay full
  | 'RENT_CHALLENGE'        // Answering Rent Defense question
  | 'CARD_DRAW'             // Challenge Card drawn, showing effect
  | 'CARD_MATH_CHALLENGE'   // Math challenge card question
  | 'JAIL_DECISION'         // Player choosing escape method
  | 'JAIL_CHALLENGE'        // Answering jail escape question
  | 'LEVEL_UP_OFFER'        // Offering Level Up at end of turn
  | 'LEVEL_UP_CHALLENGE'    // Answering Level Up question
  | 'END_TURN';             // Turn wrapping up

export type ChallengeContext =
  | 'DICE_CHALLENGE'
  | 'SMART_BUY'
  | 'RENT_DEFENSE'
  | 'CHALLENGE_CARD'
  | 'JAIL_ESCAPE'
  | 'LEVEL_UP';

// ---- Question Data Models ----

/** Column/vertical method for addition, subtraction & multiplication */
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
}

/** Vertical Step-by-Step Long Division */
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

/** Standard multiple-choice fallback */
export interface McqQuestion {
  type: 'mcq';
  text: string;
}

/** Union type — frontend uses this to decide rendering */
export type QuestionData = ColumnQuestion | LongDivisionQuestion | McqQuestion;

// ---- Math Challenge ----

export interface MathChallenge {
  id: string;
  skillName: SkillName;
  difficulty: 1 | 2 | 3;
  questionData: QuestionData;   // Structured data for rendering
  text: string;                 // Fallback inline text (e.g. "45 + 23 = ?")
  options: string[];            // 4 MCQ answer options
  correctIndex: number;
  context: ChallengeContext;
  timeLimit: number;            // Seconds
  hintLevel: 0 | 1 | 2 | 3;
  hintContent: string | null;
}

// ---- Answer Result ----

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

// ---- Rewards ----

export interface RewardResult {
  type: RewardType;
  value: number;
  description: string;
}

export type RewardType =
  | 'DISCOUNT'         // Smart Buy discount
  | 'BONUS_CASH'       // Dice challenge / card bonus
  | 'RENT_HALF'        // Rent defense success
  | 'LEVEL_UP'         // Property leveled up
  | 'JAIL_BREAK'       // Freed from jail
  | 'NONE';            // No reward (wrong answer — but never a penalty)

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

// ---- Challenge Cards ----

export interface ChallengeCard {
  id: number;
  name: string;
  description: string;
  isMathCard: boolean;
  effect: CardEffect;
  // Math card rewards (only if isMathCard)
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

// ---- Lucky Break ----

export interface LuckyBreakReward {
  type: 'cash' | 'levelUpToken';
  amount?: number;  // RM amount if cash
}

// ---- Game State ----

export interface GameState {
  id: string;
  players: PlayerState[];
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

  // Challenge card deck
  challengeCardDeck: number[];    // Shuffled card IDs
  challengeCardIndex: number;     // Current position in deck

  // Timing
  gameStartTime: number;          // Unix timestamp ms
  isFinalRound: boolean;          // After clock cap triggers

  // Auction (simplified — 10-second bidding)
  auctionState: AuctionState | null;
}

export interface AuctionState {
  tileIndex: number;
  currentBid: number;
  currentBidderId: string | null;
  timeRemaining: number;          // Seconds
  isActive: boolean;
}

// ---- Scoring (End Game) ----

export interface FinalScore {
  playerId: string;
  playerName: string;
  color: string;
  isBot: boolean;
  cash: number;
  propertyValue: number;         // Sum of purchase prices
  levelUpValue: number;          // Sum of level-up costs paid
  netWorth: number;              // cash + propertyValue + levelUpValue
  totalCorrect: number;
  totalQuestions: number;
  rank: number;
}

// ---- Post-Game Mastery Report (human players only) ----

export interface MasteryReport {
  playerId: string;
  playerName: string;
  skills: {
    skillName: SkillName;
    mastery: number;              // 0.0 – 1.0
    totalAttempts: number;
    totalCorrect: number;
  }[];
  bestSkill: SkillName;
  weakestSkill: SkillName;
  overallAccuracy: number;        // totalCorrect / totalQuestions
}
