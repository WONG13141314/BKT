// ============================================
// Game Engine Types — Shared between game logic modules
// ============================================

// ---- Board & Tiles ----

export type TileType =
  | 'GO'
  | 'PROPERTY'
  | 'COMMUNITY_CHEST'
  | 'TAX'
  | 'CHANCE'
  | 'FREE_PARKING'
  | 'JAIL'
  | 'GO_TO_JAIL';

export interface TileConfig {
  index: number;
  type: TileType;
  name: string;
  colorGroup: string | null;  // e.g. 'brown', 'lightblue', null for non-properties
  price: number;              // Purchase price (0 for non-properties)
  baseRent: number;           // Base rent without houses (0 for non-properties)
  houseCost: number;          // Cost to build one house (0 for non-properties)
}

export interface PropertyState {
  tileIndex: number;
  ownerId: string | null;     // GamePlayer id
  houses: number;             // 0–4
  hasHotel: boolean;
}

// ---- Color Groups ----

export interface ColorGroup {
  name: string;
  color: string;              // CSS color for the board
  tileIndices: number[];      // Which tile indices belong to this group
  houseCost: number;
}

// ---- Players ----

export interface PlayerState {
  id: string;                 // GamePlayer id
  userId: string;
  name: string;
  position: number;           // Tile index (0–27)
  money: number;
  color: string;
  properties: number[];       // Tile indices owned
  isInJail: boolean;
  jailTurns: number;          // 0–3
  isInDebt: boolean;
  streak: number;             // Consecutive correct answers
  totalCorrect: number;
  totalQuestions: number;
  movementTokens: number;     // Saved +1 movement bonuses
  powerCards: PowerCard[];    // Max 3
  masteryStates: Record<string, number>; // skillName → pMastery
}

// ---- Turn Flow ----

export type TurnPhase =
  | 'ROLL'          // Waiting for player to roll dice
  | 'MATH_CHALLENGE' // Showing a math question
  | 'MOVING'        // Token animation in progress
  | 'TILE_EVENT'    // Processing tile landing event
  | 'ACTION'        // Player can build/trade (optional)
  | 'END';          // Turn wrapping up

export type ChallengeContext =
  | 'ROLL_DICE'
  | 'BUY_PROPERTY'
  | 'PAY_RENT'
  | 'BUILD_HOUSE'
  | 'BUILD_HOTEL'
  | 'CHANCE_CARD'
  | 'COMMUNITY_CHEST'
  | 'TAX'
  | 'JAIL_ESCAPE'
  | 'PASSING_GO'
  | 'FREE_PARKING'
  | 'TRADE'
  | 'AUCTION'
  | 'SPECIAL_EVENT'
  | 'MATH_DUEL'
  | 'RECOVERY';

// ---- Game State ----

export interface GameState {
  id: string;
  players: PlayerState[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number; // 0–3
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  turnPhase: TurnPhase;
  round: number;              // 1–20
  maxRounds: number;          // 20
  diceValues: [number, number];
  movementBonus: number;      // Modifier from math challenge (+1 or -1 or 0)
  currentChallenge: MathChallenge | null;
  pendingTileEvent: TileEvent | null;
  auctionState: AuctionState | null;
}

// ---- Math Challenge ----

export interface MathChallenge {
  id: string;
  questionId: string;
  skillId: string;
  skillName: string;
  difficulty: 1 | 2 | 3;
  text: string;               // "You have $520. Property costs $180. How much left?"
  options: string[];           // ["$330", "$340", "$360", "$300"]
  correctIndex: number;
  context: ChallengeContext;
  timeLimit: number;           // Seconds (default 15)
  hintLevel: 0 | 1 | 2 | 3;
  hintContent: string | null;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  newMastery: number;
  previousMastery: number;
  reward: RewardResult;
  penalty: PenaltyResult | null;
  milestones: MilestoneResult[];
  streakCount: number;
  streakBroken: boolean;
  showHintNext: boolean;
}

// ---- Tile Events ----

export interface TileEvent {
  type: TileType;
  tileIndex: number;
  tileName: string;
  // Property-specific
  propertyPrice?: number;
  propertyOwner?: string | null;
  rentAmount?: number;
  // Tax-specific
  taxAmount?: number;
  taxType?: 'INCOME' | 'LUXURY';
  // Card-specific (Chance / Community Chest)
  card?: GameCard;
}

export interface GameCard {
  id: string;
  title: string;
  description: string;        // Flavor text shown to player
  mathContext: string;         // The embedded math scenario
  effect: CardEffect;
}

export type CardEffect =
  | { type: 'GAIN_MONEY'; amount: number }
  | { type: 'LOSE_MONEY'; amount: number }
  | { type: 'MOVE_TO'; tileIndex: number }
  | { type: 'MOVE_FORWARD'; spaces: number }
  | { type: 'MOVE_BACKWARD'; spaces: number }
  | { type: 'FREE_HOUSE' }
  | { type: 'COLLECT_FROM_EACH'; amount: number }
  | { type: 'PAY_EACH'; amount: number }
  | { type: 'GO_TO_JAIL' }
  | { type: 'JAIL_FREE' };

// ---- Rewards ----

export interface RewardResult {
  type: RewardType;
  value: number;              // Discount %, cash amount, or movement bonus
  description: string;        // "10% discount! You pay $162 instead of $180"
}

export type RewardType =
  | 'DISCOUNT'
  | 'BONUS_CASH'
  | 'MOVEMENT'
  | 'RENT_SHIELD'
  | 'TAX_RELIEF'
  | 'JAIL_BREAK'
  | 'POWER_CARD'
  | 'BADGE'
  | 'NONE';

export interface MilestoneResult {
  skillName: string;
  threshold: number;          // 0.5, 0.7, or 0.9
  label: string;              // "Apprentice Addition"
  cashBonus: number;
  badge: string;
}

// ---- Penalties ----

export interface PenaltyResult {
  type: PenaltyType;
  value: number;
  description: string;        // "No discount — full price of $180"
}

export type PenaltyType =
  | 'NO_DISCOUNT'
  | 'FULL_RENT'
  | 'FULL_TAX'
  | 'REDUCED_MOVEMENT'
  | 'STAY_IN_JAIL'
  | 'REDUCED_BENEFIT';

// ---- Power Cards ----

export interface PowerCard {
  type: PowerCardType;
  name: string;
  description: string;
  earnedAtRound: number;
}

export type PowerCardType =
  | 'SHIELD'        // Skip one rent payment
  | 'DOUBLE_ROLL'   // Roll twice, pick higher
  | 'DISCOUNT'      // 25% off any property
  | 'RENT_SURGE'    // Double rent on your property once
  | 'TELEPORT';     // Move to any unowned property

// ---- Auction ----

export interface AuctionState {
  tileIndex: number;
  currentBid: number;
  currentBidderId: string | null;
  biddingBonuses: Record<string, number>; // playerId → bonus $
  isActive: boolean;
}

// ---- Scoring (End Game) ----

export interface FinalScore {
  playerId: string;
  playerName: string;
  color: string;
  cash: number;
  propertyValue: number;
  buildingValue: number;
  netWorth: number;           // cash + propertyValue + buildingValue
  averageMastery: number;
  masteryMultiplier: number;  // 0.5 + averageMastery (range: 0.6–1.5)
  totalCorrect: number;
  mathBonus: number;          // totalCorrect × 10
  finalScore: number;         // (netWorth × masteryMultiplier) + mathBonus
  rank: number;
}

// ---- Skill Definitions ----

export const SKILL_NAMES = [
  'Addition',
  'Subtraction',
  'Multiplication',
  'Division',
  'Fractions',
  'Decimals',
] as const;

export type SkillName = typeof SKILL_NAMES[number];

// ---- Constants ----

export const GAME_CONSTANTS = {
  TOTAL_TILES: 28,
  MAX_PLAYERS: 4,
  STARTING_MONEY: 1000,
  MAX_ROUNDS: 20,
  BASE_GO_SALARY: 200,
  BONUS_GO_SALARY: 250,
  MASTERY_GO_SALARY: 300,
  GO_MASTERY_THRESHOLD: 0.7,
  BAIL_COST: 50,
  MAX_JAIL_TURNS: 3,
  MAX_HOUSES: 4,
  MAX_DEBT: -500,
  RECOVERY_BONUS: 75,
  MATH_DISCOUNT_PERCENT: 10,
  RENT_DISCOUNT_PERCENT: 25,
  BUILD_DISCOUNT_PERCENT: 20,
  TAX_DISCOUNT_PERCENT: 50,
  QUESTION_TIME_LIMIT: 15,    // seconds
  STREAK_BONUS_3: 50,
  STREAK_BONUS_5: 100,
  STREAK_BONUS_10: 200,
  CORRECT_ANSWER_XP: 10,      // $10 math bonus per correct answer
  MAX_POWER_CARDS: 3,
  FREE_PARKING_QUESTION_COUNT: 3,
  FREE_PARKING_PER_CORRECT: 30,
  FREE_PARKING_COMBO_BONUS: 100,
} as const;
