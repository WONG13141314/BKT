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

/**
 * A colour set, for monopoly bonuses only. It deliberately carries no skill
 * theme: sets are pairs of adjacent tiles, and with 10 property tiles across 4
 * skills a set cannot always hold one skill. Each tile's own `skillTheme` is
 * the single source of truth.
 */
export interface ColorGroup {
  name: string;
  color: string;                // CSS hex color
  tileIndices: number[];        // Which tile indices belong to this group
}

// ---- Players ----

export interface PlayerState {
  id: string;
  playerId: string;
  name: string;
  position: number;             // Tile index (0–19)
  money: number;                // In RM
  color: string;                // CSS color
  tokenType: 'race_car' | 'battleship' | 'top_hat' | 'scottie_dog';
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
  /**
   * skillName → observations, carried over from previous sessions. Difficulty
   * selection uses this so a high P(L) built on one lucky answer cannot unlock
   * the hardest tier.
   */
  skillAttempts: Record<string, number>;
  consecutiveFailures: Record<string, number>; // skillName → consecutive wrong count

  // Bot-specific
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

// ---- Turn Flow (State Machine) ----

export type TurnPhase =
  | 'ROLL_PHASE'            // Waiting for player to start their turn
  | 'ROLL_CHALLENGE'        // The turn toll — answer to earn your dice
  | 'MOVING'                // Token animation in progress
  | 'RESOLVE_TILE'          // Processing tile landing
  | 'BUY_DECISION'          // Player choosing to buy / smart-buy / skip
  | 'AUCTION'               // All players may bid for a declined property
  | 'SMART_BUY_CHALLENGE'   // Answering Smart Buy question
  | 'MATH_DUEL'             // Challenger and owner answering simultaneously
  | 'CARD_DRAW'             // Challenge Card drawn, showing effect
  | 'CARD_MATH_CHALLENGE'   // Math challenge card question
  | 'JAIL_DECISION'         // Player choosing escape method
  | 'JAIL_CHALLENGE'        // Answering jail escape question
  | 'LEVEL_UP_OFFER'        // Offering Level Up at end of turn
  | 'LEVEL_UP_CHALLENGE'    // Answering Level Up question
  | 'END_TURN';             // Turn wrapping up

export type ChallengeContext =
  | 'ROLL_CHALLENGE'
  | 'MATH_DUEL'
  | 'SMART_BUY'
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
  missingDigitRow?: 'top' | 'bottom';
}

/** Vertical Step-by-Step Long Division */
export interface LongDivisionStep {
  quotientDigit: number;
  product: number;
  subtractionResult: number;
  broughtDownDigit: number | null;
}

export type DivisionTarget =
  | 'quotient_digit'
  | 'product'
  | 'subtraction_result'
  | 'remainder';

export interface LongDivisionQuestion {
  type: 'long_division';
  divisor: number;
  dividend: number;
  quotient: number;
  remainder: number;
  steps: LongDivisionStep[];
  missingTarget: DivisionTarget;
  /** Index into `steps` of the step the player must complete. */
  missingStepIndex: number;
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
  text: string;                 // Server-side debug/logging text — never sent to clients
  options: string[];            // 4 MCQ answer options
  correctIndex: number;
  context: ChallengeContext;
  timeLimit: number;            // Seconds
  startedAt: number;            // Unix ms — when the challenge was issued
  hintLevel: 0 | 1 | 2 | 3;
  hintContent: string | null;
}

// ============================================
// Client-safe payloads
//
// `MathChallenge` and `QuestionData` carry the answer. They must never reach a
// browser: not via `correctIndex`, not via `answer`/`answerDigits`, not via
// `quotient`/`remainder`/`steps`, and not via `text` (which interpolates the
// operands for internal-digit questions). Everything below is the redacted
// projection the client actually receives — see `challenge.public.ts`.
// ============================================

/** One cell in a vertical layout: '' = blank, '?' = the value to supply, else a digit. */
export type DigitCell = string;

export type ColumnPlace = 'hundreds' | 'tens' | 'ones';

export interface PublicColumnQuestion {
  type: 'column';
  operation: '+' | '-' | '×';
  columns: ColumnPlace[];       // Left-to-right; every cell array is parallel to this
  topCells: DigitCell[];
  bottomCells: DigitCell[];
  answerCells: DigitCell[];
  /** When a whole value is the target, its row renders as one wide '?' box. */
  hiddenRow: 'top' | 'bottom' | 'answer' | null;
  /** Carry/borrow scaffold. Only sent when the target is the final answer. */
  hasRegrouping: boolean;
}

export interface PublicDivisionStep {
  productCells: DigitCell[];    // Padded to the dividend width
  showMinus: boolean;
  lineFrom: number;             // Inclusive dividend-column span of the underline
  lineTo: number;
  /** null = the work stops here; this row is not drawn. */
  resultCells: DigitCell[] | null;
}

export interface PublicLongDivisionQuestion {
  type: 'long_division';
  divisor: number;
  dividendCells: DigitCell[];
  quotientCells: DigitCell[];
  steps: PublicDivisionStep[];
  /** null = no remainder row is drawn. */
  remainderCell: DigitCell | null;
}

export interface PublicMcqQuestion {
  type: 'mcq';
  text: string;
}

export type PublicQuestionData =
  | PublicColumnQuestion
  | PublicLongDivisionQuestion
  | PublicMcqQuestion;

export interface PublicMathChallenge {
  id: string;
  questionData: PublicQuestionData;
  options: string[];
  context: ChallengeContext;
  timeLimit: number;            // Seconds
  expiresAt: number;            // Unix ms — client drives its countdown from this
  hintContent: string | null;
}

// ---- Math Duel ----
//
// Landing on an owned property starts a duel with the owner. Both answer at the
// same time, each on a question BKT picked for *them* — same skill (the
// property's theme), own difficulty. Because each question is calibrated to its
// player, both have a similar chance of getting theirs right, so a duel between
// the strongest and weakest player at the table is close to even.
//
// The stakes are upside-only: losing a duel costs exactly the rent that would
// have been due anyway. Nothing a struggling child does can make it worse. The
// owner's reward is paid by the bank, never taken from the challenger.

export interface DuelSide {
  /** `PlayerState.id` of this duellist. */
  playerId: string;
  challenge: MathChallenge;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  timeMs: number | null;
  /** BKT transition, filled in when the duel resolves. Needed for the attempt log. */
  previousMastery: number | null;
  newMastery: number | null;
}

export type DuelOutcome = 'CHALLENGER_WINS' | 'OWNER_WINS' | 'DRAW_BOTH' | 'DRAW_NEITHER';

export interface DuelState {
  tileIndex: number;
  tileName: string;
  skillName: SkillName;
  /** Rent that would be due with no duel — the most the challenger can lose. */
  rentAmount: number;
  challenger: DuelSide;
  owner: DuelSide;
  startedAt: number;
  timeLimit: number;      // Seconds, shared by both sides
  resolution: DuelResolution | null;
}

export interface DuelResolution {
  outcome: DuelOutcome;
  rentPaid: number;
  landlordBonus: number;
  challengerCorrect: boolean;
  ownerCorrect: boolean;
  headline: string;
}

/** Client-safe duel: each side's question is redacted, and only their own is sent. */
export interface PublicDuelSide {
  playerId: string;
  hasAnswered: boolean;
  /** Revealed only once the duel resolves. */
  isCorrect: boolean | null;
}

export interface PublicDuelState {
  tileIndex: number;
  tileName: string;
  rentAmount: number;
  challenger: PublicDuelSide;
  owner: PublicDuelSide;
  expiresAt: number;
  timeLimit: number;
  resolution: DuelResolution | null;
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
  /** True when the server auto-submitted because the timer ran out. */
  timedOut: boolean;
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
  | 'RENT_HALF'        // Duel draw — rent halved
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
  bankOfferAttempted?: boolean;
  bankOfferApproved?: boolean;
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
  /** Session id, `game_<ROOMCODE>` — also derives the socket room. */
  id: string;
  /**
   * Durable `Game.id` for this match. Distinct from `id` because room codes are
   * recycled, so two different matches can share one. Every `QuestionAttempt`
   * points here.
   */
  dbGameId: string;
  players: PlayerState[];
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
  duelState: DuelState | null;
  pendingTileEvent: TileEvent | null;

  // Challenge card deck
  challengeCardDeck: number[];    // Shuffled card IDs
  challengeCardIndex: number;     // Current position in deck

  // Timing
  gameStartTime: number;          // Unix timestamp ms
  isFinalRound: boolean;          // After clock cap triggers
  /** Set by socket deadline handling once the current phase has an expiry. */
  phaseDeadline?: number | null;

  // Auction (simplified — 10-second bidding)
  auctionState: AuctionState | null;
}

export interface AuctionState {
  tileIndex: number;
  currentBid: number;
  currentBidderId: string | null;
  endsAt: number;
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
    /** P(L) has passed `MASTERY_THRESHOLD`. */
    isMastered: boolean;
  }[];
  bestSkill: SkillName;
  weakestSkill: SkillName;
  overallAccuracy: number;        // totalCorrect / totalQuestions
}
