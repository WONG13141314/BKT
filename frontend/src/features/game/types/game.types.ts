// ============================================
// Game Types — Frontend
// Mirrors backend game engine types for UI rendering
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
  colorGroup: string | null;
  price: number;
  baseRent: number;
  houseCost: number;
}

export interface PropertyState {
  tileIndex: number;
  ownerId: string | null;
  houses: number;
  hasHotel: boolean;
}

// ---- Color Group ----

export interface ColorGroup {
  name: string;
  color: string;
  tileIndices: number[];
  houseCost: number;
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
  isInDebt: boolean;
  streak: number;
  totalCorrect: number;
  totalQuestions: number;
  movementTokens: number;
  powerCards: PowerCard[];
  masteryStates: Record<string, number>;
}

// ---- Turn Flow ----

export type TurnPhase =
  | 'ROLL'
  | 'MATH_CHALLENGE'
  | 'MOVING'
  | 'TILE_EVENT'
  | 'ACTION'
  | 'END';

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
  players: Player[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  turnPhase: TurnPhase;
  round: number;
  maxRounds: number;
  diceValues: [number, number];
  movementBonus: number;
  currentChallenge: MathChallenge | null;
  pendingTileEvent: TileEvent | null;
}

// ---- Math Challenge ----

export interface MathChallenge {
  id: string;
  questionId: string;
  skillId: string;
  skillName: string;
  difficulty: 1 | 2 | 3;
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
  propertyPrice?: number;
  propertyOwner?: string | null;
  rentAmount?: number;
  taxAmount?: number;
  taxType?: 'INCOME' | 'LUXURY';
  card?: GameCard;
}

export interface GameCard {
  id: string;
  title: string;
  description: string;
  mathContext: string;
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
  value: number;
  description: string;
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
  threshold: number;
  label: string;
  cashBonus: number;
  badge: string;
}

// ---- Penalties ----

export interface PenaltyResult {
  type: PenaltyType;
  value: number;
  description: string;
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
  | 'SHIELD'
  | 'DOUBLE_ROLL'
  | 'DISCOUNT'
  | 'RENT_SURGE'
  | 'TELEPORT';

// ---- Scoring ----

export interface FinalScore {
  playerId: string;
  playerName: string;
  color: string;
  cash: number;
  propertyValue: number;
  buildingValue: number;
  netWorth: number;
  averageMastery: number;
  masteryMultiplier: number;
  totalCorrect: number;
  mathBonus: number;
  finalScore: number;
  rank: number;
}

// ---- Constants ----

export const GAME_CONSTANTS = {
  TOTAL_TILES: 28,
  MAX_PLAYERS: 4,
  STARTING_MONEY: 1000,
  MAX_ROUNDS: 20,
  QUESTION_TIME_LIMIT: 15,
} as const;

// ---- Skill Names ----

export const SKILL_NAMES = [
  'Addition',
  'Subtraction',
  'Multiplication',
  'Division',
  'Fractions',
  'Decimals',
] as const;

export type SkillName = typeof SKILL_NAMES[number];

