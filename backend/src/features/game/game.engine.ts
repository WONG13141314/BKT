// ============================================
// Game Engine — MathOpoly Redesign
// New turn state machine, 20-tile board, no houses/hotels
// Level Up system, challenge cards, RM currency
// ============================================

import { randomUUID } from 'crypto';
import {
  GameState,
  PlayerState,
  AnswerResult,
  RewardResult,
  TileEvent,
  FinalScore,
  MasteryReport,
  LuckyBreakReward,
  CardEffect,
  TileConfig,
  DuelState,
  DuelSide,
  DuelOutcome,
  DuelResolution,
} from './game.types';
import { SKILL_NAMES, SkillName } from './game.constants';
import {
  BOARD_TILES,
  calculateRent,
  calculatePropertyValue,
  calculateLevelUpValue,
  ownsFullColorGroup,
  getLevelUpCost,
  initializeProperties,
} from './board.config';
import {
  STARTING_MONEY,
  GO_SALARY,
  TAX_AMOUNT,
  LUXURY_TAX_AMOUNT,
  BAIL_COST,
  MAX_ROUNDS,
  CLOCK_CAP_MINUTES,
  MAX_JAIL_TURNS,
  TOTAL_TILES,
  ROLL_CHALLENGE_BONUS,
  SMART_BUY_DISCOUNT,
  DUEL_TIME_LIMIT,
  LANDLORD_BONUS,
  DUEL_DRAW_RENT_RATIO,
  LUCKY_BREAK_CASH_OPTIONS,
  LUCKY_BREAK_TOKEN_CHANCE,
  formatRM,
} from './game.constants';
import { createShuffledDeck, drawCard, getCardById } from './card.deck';
import { updateMastery } from '../../bkt/bkt.engine';
import { selectChallenge, getAdjustedParams } from '../../bkt/bkt.selector';
import { INITIAL_MASTERY } from '../../bkt/bkt.defaults';

// ============================================
// GAME INITIALIZATION
// ============================================

export interface GamePlayerSeed {
  id: string;
  playerId: string;
  name: string;
  color: string;
  order: number;
  isBot?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
  /**
   * Mastery carried over from this player's previous sessions, keyed by skill
   * name. Absent skills fall back to `INITIAL_MASTERY`, so a first-time player
   * and a returning one take the same code path.
   */
  masteryPriors?: Record<string, number>;
  /**
   * Observations already recorded per skill, carried over from previous
   * sessions. A returning player is not re-gated to easy questions just because
   * this match has only just started.
   */
  attemptPriors?: Record<string, number>;
}

export function initializeGameState(
  gameId: string,
  players: GamePlayerSeed[],
  dbGameId: string = randomUUID()
): GameState {
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    playerId: p.playerId,
    name: p.name,
    position: 0,
    money: STARTING_MONEY,
    color: p.color,
    properties: [],
    isInJail: false,
    jailTurns: 0,
    isBankrupt: false,
    streak: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    hasLevelUpToken: false,
    hasRentShield: false,
    hasDiscountToken: false,
    masteryStates: Object.fromEntries(
      SKILL_NAMES.map((s) => [s, p.masteryPriors?.[s] ?? INITIAL_MASTERY])
    ),
    skillAttempts: Object.fromEntries(
      SKILL_NAMES.map((s) => [s, p.attemptPriors?.[s] ?? 0])
    ),
    consecutiveFailures: Object.fromEntries(SKILL_NAMES.map((s) => [s, 0])),
    isBot: p.isBot ?? false,
    botDifficulty: p.botDifficulty,
  }));

  // Sort by order
  playerStates.sort((a, b) => {
    const orderA = players.find((p) => p.id === a.id)!.order;
    const orderB = players.find((p) => p.id === b.id)!.order;
    return orderA - orderB;
  });

  return {
    id: gameId,
    dbGameId,
    players: playerStates,
    tiles: BOARD_TILES,
    properties: initializeProperties(),
    currentPlayerIndex: 0,
    phase: 'PLAYING',
    turnPhase: 'ROLL_PHASE',
    round: 1,
    maxRounds: MAX_ROUNDS,
    diceValues: [1, 1],
    diceCount: 2,
    currentChallenge: null,
    duelState: null,
    pendingTileEvent: null,
    challengeCardDeck: createShuffledDeck(),
    challengeCardIndex: 0,
    gameStartTime: Date.now(),
    isFinalRound: false,
    auctionState: null,
  };
}

// ============================================
// TURN FLOW — State Machine
// ============================================

/** Get the current player */
export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

/** Get active (non-bankrupt) players */
export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.isBankrupt);
}

// ---- A. ROLL PHASE ----

/**
 * Open the turn. Jailed players go to the jail decision; everyone else faces the
 * Roll Challenge — the question is the toll for the turn.
 *
 * Before Phase 4 the dice were thrown here and a question appeared only 1 turn
 * in 3, so a whole session produced roughly seven observations across four
 * skills. BKT cannot converge on that. Now every turn contributes one
 * BKT-selected question, and the dice follow the answer.
 */
export function startRollPhase(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // If player is in jail → jail decision instead (unless max jail turns reached)
  if (player.isInJail) {
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
        ...p,
        isInJail: false,
        jailTurns: 0,
      }));
      return startRollPhase({ ...state, players: updatedPlayers });
    }
    return { ...state, turnPhase: 'JAIL_DECISION' };
  }

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'ROLL_CHALLENGE',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
  });

  return {
    ...state,
    turnPhase: 'ROLL_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Roll a fair d6. */
function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---- ROLL CHALLENGE ANSWER ----

/**
 * Grade the turn toll and hand out the dice.
 *
 * Correct → two dice. Wrong → one. The player always moves: a wrong answer costs
 * distance, never the turn itself. Being stuck on the spot would punish exactly
 * the children this game exists to help, and they would stop answering.
 */
export function processRollChallengeAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  const diceCount: 1 | 2 = isCorrect ? 2 : 1;
  const diceValues: [number, number] = isCorrect ? [rollDie(), rollDie()] : [rollDie(), 0];

  const reward: RewardResult = isCorrect
    ? {
        type: 'BONUS_CASH',
        value: ROLL_CHALLENGE_BONUS,
        description: `Correct! Two dice, and +${formatRM(ROLL_CHALLENGE_BONUS)}.`,
      }
    : { type: 'NONE', value: 0, description: 'One die this turn — you still move.' };

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: isCorrect ? p.money + ROLL_CHALLENGE_BONUS : p.money,
    ...applyAnswerToPlayer(p, challenge.skillName, isCorrect, newMastery),
  }));

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      diceValues,
      diceCount,
      turnPhase: 'MOVING',
      currentChallenge: null,
    },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
  };
}

// ---- B. MOVING ----

export function movePlayer(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const totalMovement = state.diceValues[0] + state.diceValues[1]; // Pure dice, no modifier
  const oldPosition = player.position;
  const newPosition = (oldPosition + totalMovement) % TOTAL_TILES;
  const passedGo = newPosition < oldPosition; // Wrapped around

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    position: newPosition,
    money: passedGo ? p.money + GO_SALARY : p.money,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'RESOLVE_TILE',
  };
}

// ---- C. RESOLVE TILE ----

export function resolveTileEvent(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const tile = BOARD_TILES[player.position];

  if (!tile) return { ...state, turnPhase: 'END_TURN' };

  switch (tile.type) {
    case 'GO':
      // Already collected salary in movePlayer if passed GO
      return { ...state, turnPhase: 'END_TURN' };

    case 'PROPERTY':
      return resolvePropertyTile(state, player, tile.index);

    case 'TAX':
      return resolveTaxTile(state, tile.index);

    case 'CHALLENGE_CARD':
      return resolveChallengeCardTile(state, player);

    case 'LUCKY_BREAK':
      return resolveLuckyBreak(state, player);

    case 'REST':
      return { ...state, turnPhase: 'END_TURN' };

    case 'GO_TO_JAIL':
      return resolveGoToJail(state);

    case 'JAIL':
      // "Just Visiting"
      return { ...state, turnPhase: 'END_TURN' };

    default:
      return { ...state, turnPhase: 'END_TURN' };
  }
}

// ---- PROPERTY TILE ----

function resolvePropertyTile(state: GameState, player: PlayerState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const property = state.properties.find((p) => p.tileIndex === tileIndex);

  if (!property) return { ...state, turnPhase: 'END_TURN' };

  // UNOWNED → buy decision
  if (property.ownerId === null) {
    if (player.money >= tile.price && !player.isBankrupt) {
      const event: TileEvent = {
        type: 'PROPERTY',
        tileIndex,
        tileName: tile.name,
        propertyPrice: tile.price,
        propertyOwner: null,
      };
      return {
        ...state,
        turnPhase: 'BUY_DECISION',
        pendingTileEvent: event,
      };
    }
    // Can't afford → skip (no auction in simplified version for now)
    return { ...state, turnPhase: 'END_TURN' };
  }

  // OWN PROPERTY → nothing
  if (property.ownerId === player.id) {
    return { ...state, turnPhase: 'END_TURN' };
  }

  // OPPONENT'S PROPERTY → rent
  const owner = state.players.find((p) => p.id === property.ownerId);
  if (!owner || owner.isBankrupt) return { ...state, turnPhase: 'END_TURN' };

  // Check rent shield
  if (player.hasRentShield) {
    const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      hasRentShield: false,
    }));
    return { ...state, players: updatedPlayers, turnPhase: 'END_TURN' };
  }

  const hasMonopoly = tile.colorGroup ? ownsFullColorGroup(owner.properties, tile.colorGroup) : false;
  const rent = calculateRent(tile, property.isLeveledUp, hasMonopoly);

  const event: TileEvent = {
    type: 'PROPERTY',
    tileIndex,
    tileName: tile.name,
    propertyOwner: property.ownerId,
    rentAmount: rent,
    isMonopoly: hasMonopoly,
    isLeveledUp: property.isLeveledUp,
  };

  // The rent is disputed: challenger and owner answer at the same time.
  return {
    ...state,
    turnPhase: 'MATH_DUEL',
    pendingTileEvent: event,
    duelState: buildDuel(player, owner, tile, rent),
  };
}

// ---- MATH DUEL ----

/**
 * Set up a duel over one property's rent.
 *
 * Both duellists get the *same skill* — the property's theme, which is what
 * makes it read as a fair contest — but each at their own BKT difficulty. That
 * is the whole fairness mechanism: because each question is calibrated to its
 * player, both sit at a similar probability of answering correctly, so a duel
 * between the strongest and weakest player at the table is close to even while
 * still stretching each of them appropriately.
 */
function buildDuel(
  challenger: PlayerState,
  owner: PlayerState,
  tile: TileConfig,
  rent: number
): DuelState {
  const skillName = (tile.skillTheme ?? 'Addition') as SkillName;

  const questionFor = (player: PlayerState) =>
    selectChallenge({
      masteryStates: player.masteryStates,
      context: 'MATH_DUEL',
      consecutiveFailures: player.consecutiveFailures,
      skillAttempts: player.skillAttempts,
      forceSkill: skillName,
    });

  const side = (player: PlayerState): DuelSide => ({
    playerId: player.id,
    challenge: questionFor(player),
    selectedIndex: null,
    isCorrect: null,
    timeMs: null,
    previousMastery: null,
    newMastery: null,
  });

  return {
    tileIndex: tile.index,
    tileName: tile.name,
    skillName,
    rentAmount: rent,
    challenger: side(challenger),
    owner: side(owner),
    startedAt: Date.now(),
    timeLimit: DUEL_TIME_LIMIT,
    resolution: null,
  };
}

/**
 * Record one duellist's answer. Returns unchanged state if this player is not in
 * the duel or has already answered — a second submission cannot overwrite a
 * graded answer.
 */
export function submitDuelAnswer(
  state: GameState,
  playerId: string,
  selectedIndex: number,
  timeMs: number
): GameState {
  const duel = state.duelState;
  if (!duel || duel.resolution) return state;

  const which =
    duel.challenger.playerId === playerId
      ? 'challenger'
      : duel.owner.playerId === playerId
        ? 'owner'
        : null;

  if (!which || duel[which].selectedIndex !== null) return state;

  const side = duel[which];
  const answered: DuelSide = {
    ...side,
    selectedIndex,
    isCorrect: selectedIndex === side.challenge.correctIndex,
    timeMs,
  };

  return { ...state, duelState: { ...duel, [which]: answered } };
}

export function bothDuellistsAnswered(state: GameState): boolean {
  const duel = state.duelState;
  return !!duel && duel.challenger.selectedIndex !== null && duel.owner.selectedIndex !== null;
}

/**
 * Settle the duel and move the money.
 *
 * | | Owner correct | Owner wrong |
 * |---|---|---|
 * | **Challenger correct** | draw — half rent | challenger wins — no rent |
 * | **Challenger wrong**   | owner wins — full rent | draw — full rent |
 *
 * The challenger can never pay more than the rent they owed before the duel
 * started, so a child who is struggling is never punished twice for it. The
 * owner's reward is paid by the bank rather than taken from the challenger, for
 * the same reason.
 *
 * Any side that has not answered when time runs out counts as wrong.
 */
export function resolveDuel(state: GameState): {
  newState: GameState;
  duel: DuelState;
  resolution: DuelResolution;
} {
  const duel = state.duelState!;

  const challengerCorrect = duel.challenger.isCorrect === true;
  const ownerCorrect = duel.owner.isCorrect === true;

  let outcome: DuelOutcome;
  let rentPaid: number;

  if (challengerCorrect && ownerCorrect) {
    outcome = 'DRAW_BOTH';
    rentPaid = Math.floor(duel.rentAmount * DUEL_DRAW_RENT_RATIO);
  } else if (challengerCorrect) {
    outcome = 'CHALLENGER_WINS';
    rentPaid = 0;
  } else if (ownerCorrect) {
    outcome = 'OWNER_WINS';
    rentPaid = duel.rentAmount;
  } else {
    outcome = 'DRAW_NEITHER';
    rentPaid = duel.rentAmount;
  }

  const landlordBonus = ownerCorrect ? LANDLORD_BONUS : 0;

  const resolution: DuelResolution = {
    outcome,
    rentPaid,
    landlordBonus,
    challengerCorrect,
    ownerCorrect,
    headline: duelHeadline(outcome, rentPaid, duel.rentAmount, landlordBonus),
  };

  // Apply both players' BKT updates, recording each transition on its side so
  // the attempt log has the before/after it cannot reconstruct later.
  let players = state.players;

  const settleSide = (side: DuelSide): DuelSide => {
    const idx = players.findIndex((p) => p.id === side.playerId);
    if (idx === -1) return side;

    const correct = side.isCorrect === true;
    const { newMastery, previousMastery } = updatePlayerMastery(
      players[idx], side.challenge.skillName as SkillName, correct, side.challenge.difficulty
    );

    players = updatePlayerInList(players, idx, (p) => ({
      ...p,
      ...applyAnswerToPlayer(p, side.challenge.skillName, correct, newMastery),
    }));

    // An unanswered side is graded wrong, and says so explicitly.
    return { ...side, isCorrect: correct, previousMastery, newMastery };
  };

  const challengerSide = settleSide(duel.challenger);
  const ownerSide = settleSide(duel.owner);

  const challengerIdx = players.findIndex((p) => p.id === challengerSide.playerId);
  const ownerIdx = players.findIndex((p) => p.id === ownerSide.playerId);

  players = players.map((p, idx) => {
    if (idx === challengerIdx) return { ...p, money: p.money - rentPaid };
    if (idx === ownerIdx) return { ...p, money: p.money + rentPaid + landlordBonus };
    return p;
  });

  const settled: DuelState = {
    ...duel,
    challenger: challengerSide,
    owner: ownerSide,
    resolution,
  };

  return {
    newState: {
      ...state,
      players,
      duelState: settled,
      pendingTileEvent: null,
      turnPhase: 'END_TURN',
    },
    duel: settled,
    resolution,
  };
}

function duelHeadline(
  outcome: DuelOutcome,
  rentPaid: number,
  fullRent: number,
  bonus: number
): string {
  const bonusNote = bonus > 0 ? ` Landlord's bonus +${formatRM(bonus)}.` : '';

  switch (outcome) {
    case 'CHALLENGER_WINS':
      return `Rent defended — no rent to pay!`;
    case 'OWNER_WINS':
      return `Property held. Rent ${formatRM(fullRent)}.${bonusNote}`;
    case 'DRAW_BOTH':
      return `Both correct — rent halved to ${formatRM(rentPaid)}.${bonusNote}`;
    case 'DRAW_NEITHER':
    default:
      return `Neither answer stood. Rent ${formatRM(fullRent)}.`;
  }
}

// ---- BUY DECISIONS ----

/** Player buys at full price (or discounted if they have a discount token) */
export function buyPropertyFullPrice(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  let price = event.propertyPrice!;

  // Apply discount token if available
  let useDiscount = false;
  if (player.hasDiscountToken) {
    price = Math.floor(price * 0.70); // 30% off
    useDiscount = true;
  }

  if (player.money < price) return state; // Can't afford

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: p.money - price,
    properties: [...p.properties, event.tileIndex],
    hasDiscountToken: useDiscount ? false : p.hasDiscountToken,
  }));

  const updatedProperties = state.properties.map((prop) =>
    prop.tileIndex === event.tileIndex ? { ...prop, ownerId: player.id } : prop
  );

  return {
    ...state,
    players: updatedPlayers,
    properties: updatedProperties,
    turnPhase: 'END_TURN',
    pendingTileEvent: null,
  };
}

/** Player opts into Smart Buy challenge */
export function startSmartBuyChallenge(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  const tile = BOARD_TILES[event.tileIndex];

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'SMART_BUY',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
    propertyPrice: event.propertyPrice,
    propertySkillTheme: tile?.skillTheme as SkillName | undefined,
  });

  return {
    ...state,
    turnPhase: 'SMART_BUY_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process Smart Buy answer */
export function processSmartBuyAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const event = state.pendingTileEvent!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  const fullPrice = event.propertyPrice!;
  const discountedPrice = Math.floor(fullPrice * (1 - SMART_BUY_DISCOUNT));
  const finalPrice = isCorrect ? discountedPrice : fullPrice;

  const reward: RewardResult = isCorrect
    ? { type: 'DISCOUNT', value: SMART_BUY_DISCOUNT * 100, description: `Smart Buy! 20% off — you pay ${formatRM(discountedPrice)} instead of ${formatRM(fullPrice)}!` }
    : { type: 'NONE', value: 0, description: `Full price: ${formatRM(fullPrice)}` };

  if (player.money < finalPrice) {
    // Can't afford even after discount/full price — skip purchase
    const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
    return {
      newState: { ...state, players: updatedPlayers, turnPhase: 'END_TURN', currentChallenge: null, pendingTileEvent: null },
      result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
    };
  }

  // Apply discount token stack if available
  let actualPrice = finalPrice;
  let useDiscountToken = false;
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.hasDiscountToken) {
    actualPrice = Math.floor(actualPrice * 0.70);
    useDiscountToken = true;
  }

  const updatedPlayers = updatePlayerInList(
    updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery),
    state.currentPlayerIndex,
    (p) => ({
      ...p,
      money: p.money - actualPrice,
      properties: [...p.properties, event.tileIndex],
      hasDiscountToken: useDiscountToken ? false : p.hasDiscountToken,
    })
  );

  const updatedProperties = state.properties.map((prop) =>
    prop.tileIndex === event.tileIndex ? { ...prop, ownerId: player.id } : prop
  );

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      properties: updatedProperties,
      turnPhase: 'END_TURN',
      currentChallenge: null,
      pendingTileEvent: null,
    },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
  };
}

/** Player skips buying */
export function skipBuy(state: GameState): GameState {
  return { ...state, turnPhase: 'END_TURN', pendingTileEvent: null };
}

// ---- RENT ----

/** Player pays full rent (skips defense) */
// Rent Defense was replaced by the Math Duel in Phase 4. Landing on an owned
// property now disputes the rent with the owner instead of being a solo question
// — see `buildDuel` / `resolveDuel` above.

// ---- TAX ----

function resolveTaxTile(state: GameState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const taxAmount = tile.name === 'Cukai Mewah' ? LUXURY_TAX_AMOUNT : TAX_AMOUNT;

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: p.money - taxAmount,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
    pendingTileEvent: {
      type: 'TAX',
      tileIndex,
      tileName: tile.name,
      taxAmount,
    },
  };
}

// ---- CHALLENGE CARD ----

function resolveChallengeCardTile(state: GameState, player: PlayerState): GameState {
  const { card, newIndex, newDeck } = drawCard(state.challengeCardDeck, state.challengeCardIndex);

  const event: TileEvent = {
    type: 'CHALLENGE_CARD',
    tileIndex: player.position,
    tileName: 'Challenge Card',
    card,
  };

  if (card.isMathCard) {
    // Math challenge card → generate question
    const challenge = selectChallenge({
      masteryStates: player.masteryStates,
      context: 'CHALLENGE_CARD',
      consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
    });

    return {
      ...state,
      challengeCardDeck: newDeck,
      challengeCardIndex: newIndex,
      turnPhase: 'CARD_MATH_CHALLENGE',
      currentChallenge: challenge,
      pendingTileEvent: event,
    };
  }

  // Luck card → apply effect immediately
  const stateAfterCard = applyCardEffect(
    { ...state, challengeCardDeck: newDeck, challengeCardIndex: newIndex },
    card.effect,
    player
  );

  return {
    ...stateAfterCard,
    turnPhase: 'CARD_DRAW', // Show card to player briefly before END_TURN
    pendingTileEvent: event,
  };
}

/** Process a math challenge card answer */
export function processCardChallengeAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const card = state.pendingTileEvent?.card || getCardById(8)!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  const fallbackEffect: CardEffect = { type: 'GAIN_MONEY', amount: isCorrect ? 80 : 20 };
  const effect = (isCorrect ? card?.correctReward : card?.wrongOutcome) || card?.effect || fallbackEffect;
  const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
  let stateAfterEffect = { ...state, players: updatedPlayers };
  stateAfterEffect = applyCardEffect(stateAfterEffect, effect, getCurrentPlayer(stateAfterEffect));

  const cardName = card?.name || 'Challenge Card';
  const reward: RewardResult = isCorrect
    ? { type: 'BONUS_CASH', value: 0, description: `${cardName} — Correct! ${describeEffect(effect)}` }
    : { type: 'NONE', value: 0, description: `${cardName} — ${describeEffect(effect)}` };

  return {
    newState: {
      ...stateAfterEffect,
      turnPhase: 'END_TURN',
      currentChallenge: null,
      pendingTileEvent: null,
    },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
  };
}

/** Transition from CARD_DRAW to END_TURN (after player sees the card) */
export function acknowledgeCard(state: GameState): GameState {
  return { ...state, turnPhase: 'END_TURN', pendingTileEvent: null };
}

function applyCardEffect(state: GameState, effect: CardEffect, player: PlayerState): GameState {
  const playerIdx = state.currentPlayerIndex;

  switch (effect.type) {
    case 'GAIN_MONEY':
      return updatePlayerMoney(state, playerIdx, effect.amount);
    case 'LOSE_MONEY':
      return updatePlayerMoney(state, playerIdx, -effect.amount);
    case 'COLLECT_FROM_EACH': {
      const otherPlayers = state.players.filter((p, i) => i !== playerIdx && !p.isBankrupt);
      const totalCollected = otherPlayers.length * effect.amount;
      let players = state.players.map((p, i) => {
        if (i === playerIdx) return { ...p, money: p.money + totalCollected };
        if (!p.isBankrupt) return { ...p, money: p.money - effect.amount };
        return p;
      });
      return { ...state, players };
    }
    case 'MOVE_FORWARD': {
      const newPos = (player.position + effect.spaces) % TOTAL_TILES;
      const passedGo = newPos < player.position;
      return {
        ...state,
        players: updatePlayerInList(state.players, playerIdx, (p) => ({
          ...p,
          position: newPos,
          money: passedGo ? p.money + GO_SALARY : p.money,
        })),
      };
    }
    case 'MOVE_BACKWARD': {
      let newPos = player.position - effect.spaces;
      if (newPos < 0) newPos += TOTAL_TILES;
      return {
        ...state,
        players: updatePlayerInList(state.players, playerIdx, (p) => ({
          ...p,
          position: newPos,
        })),
      };
    }
    case 'GO_TO_JAIL':
      return sendToJail(state, playerIdx);
    case 'FREE_LEVEL_UP_TOKEN':
      return {
        ...state,
        players: updatePlayerInList(state.players, playerIdx, (p) => ({
          ...p,
          hasLevelUpToken: true,
        })),
      };
    case 'RENT_SHIELD':
      return {
        ...state,
        players: updatePlayerInList(state.players, playerIdx, (p) => ({
          ...p,
          hasRentShield: true,
        })),
      };
    case 'DISCOUNT_TOKEN':
      return {
        ...state,
        players: updatePlayerInList(state.players, playerIdx, (p) => ({
          ...p,
          hasDiscountToken: true,
        })),
      };
    case 'STEAL_FROM_RICHEST': {
      const richest = state.players
        .filter((p, i) => i !== playerIdx && !p.isBankrupt)
        .sort((a, b) => b.money - a.money)[0];
      if (!richest) return state;
      const richestIdx = state.players.findIndex((p) => p.id === richest.id);
      const stealAmount = Math.min(effect.amount, richest.money);
      let players = state.players.map((p, i) => {
        if (i === playerIdx) return { ...p, money: p.money + stealAmount };
        if (i === richestIdx) return { ...p, money: p.money - stealAmount };
        return p;
      });
      return { ...state, players };
    }
    case 'NOTHING':
      return state;
    default:
      return state;
  }
}

function describeEffect(effect: CardEffect): string {
  switch (effect.type) {
    case 'GAIN_MONEY': return `Gained ${formatRM(effect.amount)}!`;
    case 'LOSE_MONEY': return `Lost ${formatRM(effect.amount)}.`;
    case 'MOVE_FORWARD': return `Move forward ${effect.spaces} spaces!`;
    case 'MOVE_BACKWARD': return `Move back ${effect.spaces} spaces.`;
    case 'GO_TO_JAIL': return 'Go to Jail!';
    case 'COLLECT_FROM_EACH': return `Collected ${formatRM(effect.amount)} from each player!`;
    case 'FREE_LEVEL_UP_TOKEN': return 'Free Level Up token!';
    case 'RENT_SHIELD': return 'Rent Shield activated!';
    case 'DISCOUNT_TOKEN': return `${effect.percent}% discount on next purchase!`;
    case 'STEAL_FROM_RICHEST': return `Stole ${formatRM(effect.amount)} from the richest player!`;
    case 'NOTHING': return 'Nothing happened.';
    default: return '';
  }
}

// ---- LUCKY BREAK ----

function resolveLuckyBreak(state: GameState, player: PlayerState): GameState {
  let reward: LuckyBreakReward;

  if (Math.random() < LUCKY_BREAK_TOKEN_CHANCE) {
    reward = { type: 'levelUpToken' };
  } else {
    const amount = LUCKY_BREAK_CASH_OPTIONS[Math.floor(Math.random() * LUCKY_BREAK_CASH_OPTIONS.length)];
    reward = { type: 'cash', amount };
  }

  let updatedPlayers: PlayerState[];
  if (reward.type === 'cash') {
    updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      money: p.money + reward.amount!,
    }));
  } else {
    updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      hasLevelUpToken: true,
    }));
  }

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
    pendingTileEvent: {
      type: 'LUCKY_BREAK',
      tileIndex: player.position,
      tileName: 'Lucky Break',
      luckyBreakReward: reward,
    },
  };
}

// ---- JAIL ----

function resolveGoToJail(state: GameState): GameState {
  // Go directly to jail — turn ends. Jail decision happens on player's NEXT turn.
  return {
    ...sendToJail(state, state.currentPlayerIndex),
    turnPhase: 'END_TURN',
  };
}

function sendToJail(state: GameState, playerIdx: number): GameState {
  const jailTileIdx = BOARD_TILES.findIndex((t) => t.type === 'JAIL');

  return {
    ...state,
    players: updatePlayerInList(state.players, playerIdx, (p) => ({
      ...p,
      position: jailTileIdx >= 0 ? jailTileIdx : 5,
      isInJail: true,
      jailTurns: 0,
    })),
  };
}

/** Player attempts math escape from jail */
export function startJailMathEscape(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'JAIL_ESCAPE',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
  });

  return {
    ...state,
    turnPhase: 'JAIL_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process jail escape answer */
export function processJailEscapeAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  let updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
  const newJailTurns = player.jailTurns + 1;

  if (isCorrect || newJailTurns >= MAX_JAIL_TURNS) {
    // Freed! Player gets a normal turn (either via correct math answer or reaching max jail turns)
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      isInJail: false,
      jailTurns: 0,
    }));

    const reward: RewardResult = isCorrect
      ? { type: 'JAIL_BREAK', value: 0, description: 'You escaped jail! Take your turn!' }
      : { type: 'NONE', value: 0, description: 'Max jail turns reached! Released from jail!' };

    // Re-roll dice for the freed player
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;

    return {
      newState: {
        ...state,
        players: updatedPlayers,
        diceValues: [die1, die2],
        turnPhase: 'MOVING',
        currentChallenge: null,
      },
      result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
    };
  } else {
    // Stay jailed for now, increment jail turns
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      jailTurns: newJailTurns,
    }));

    const reward: RewardResult = {
      type: 'NONE',
      value: 0,
      description: 'Still in jail. Better luck next turn!',
    };

    return {
      newState: {
        ...state,
        players: updatedPlayers,
        turnPhase: 'END_TURN',
        currentChallenge: null,
      },
      result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
    };
  }
}

/** Player pays bail */
export function payBail(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  if (player.money < BAIL_COST) return state;

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: p.money - BAIL_COST,
    isInJail: false,
    jailTurns: 0,
  }));

  // Re-roll for freed player
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;

  return {
    ...state,
    players: updatedPlayers,
    diceValues: [die1, die2],
    turnPhase: 'MOVING',
  };
}

/** Player waits in jail */
export function waitInJail(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const newJailTurns = player.jailTurns + 1;

  // Auto-release after MAX_JAIL_TURNS
  if (newJailTurns >= MAX_JAIL_TURNS) {
    const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      isInJail: false,
      jailTurns: 0,
    }));

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;

    return {
      ...state,
      players: updatedPlayers,
      diceValues: [die1, die2],
      turnPhase: 'MOVING',
    };
  }

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    jailTurns: newJailTurns,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
  };
}

// ---- D. LEVEL UP ----

/** Check if player is eligible for Level Up at end of turn */
export function checkLevelUpEligibility(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // Find a property the player can level up:
  // Must own both in the color set, and at least one is not leveled
  for (const propIdx of player.properties) {
    const tile = BOARD_TILES[propIdx];
    if (!tile || !tile.colorGroup) continue;

    const hasMonopoly = ownsFullColorGroup(player.properties, tile.colorGroup);
    if (!hasMonopoly) continue;

    const prop = state.properties.find((p) => p.tileIndex === propIdx);
    if (!prop || prop.isLeveledUp) continue;

    const cost = getLevelUpCost(tile);
    // Player must be able to afford it (or have a free token)
    if (player.money >= cost || player.hasLevelUpToken) {
      return {
        ...state,
        turnPhase: 'LEVEL_UP_OFFER',
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex: propIdx,
          tileName: tile.name,
          propertyPrice: cost,
        },
      };
    }
  }

  // No eligible property → skip
  return state;
}

/** Player accepts Level Up challenge */
export function startLevelUpChallenge(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  const tile = BOARD_TILES[event.tileIndex];

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'LEVEL_UP',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
    propertySkillTheme: tile?.skillTheme as SkillName | undefined,
  });

  return {
    ...state,
    turnPhase: 'LEVEL_UP_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process Level Up answer */
export function processLevelUpAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const event = state.pendingTileEvent!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  let updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
  let updatedProperties = state.properties;

  const reward: RewardResult = isCorrect
    ? { type: 'LEVEL_UP', value: 0, description: `${event.tileName} leveled up — rent increased!` }
    : { type: 'NONE', value: 0, description: 'Level Up failed. Try again next turn!' };

  if (isCorrect) {
    const cost = event.propertyPrice!;
    const useToken = player.hasLevelUpToken;

    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      money: useToken ? p.money : p.money - cost,
      hasLevelUpToken: useToken ? false : p.hasLevelUpToken,
    }));

    updatedProperties = state.properties.map((prop) =>
      prop.tileIndex === event.tileIndex ? { ...prop, isLeveledUp: true } : prop
    );
  }

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      properties: updatedProperties,
      turnPhase: 'END_TURN',
      currentChallenge: null,
      pendingTileEvent: null,
      // Mark that level up was already handled this turn — prevent re-check loop
      _skipLevelUpCheck: true,
    } as GameState,
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
  };
}

/** Player declines Level Up */
export function declineLevelUp(state: GameState): GameState {
  // Mark that level up was already handled this turn
  return { ...state, turnPhase: 'END_TURN', pendingTileEvent: null, _skipLevelUpCheck: true } as GameState;
}

// ---- E. END TURN ----

export function endTurn(state: GameState, skipLevelUpCheck?: boolean): GameState {
  // Check Level Up eligibility before truly ending —
  // BUT skip if we just came from a Level Up answer/decline to prevent infinite loop
  const shouldSkipLevelUp = skipLevelUpCheck || (state as any)._skipLevelUpCheck;
  if (!shouldSkipLevelUp &&
      state.turnPhase !== 'LEVEL_UP_OFFER' &&
      state.turnPhase !== 'LEVEL_UP_CHALLENGE') {
    const levelUpState = checkLevelUpEligibility(state);
    if (levelUpState.turnPhase === 'LEVEL_UP_OFFER') {
      return levelUpState;
    }
  }

  // Check bankruptcy
  let updatedState = checkBankruptcy(state);

  // Once the wall-clock cap is hit we finish the current lap, then stop. This is
  // a flag on the state, not a game-over — returning early here used to skip the
  // turn advance and strand the current player in END_TURN.
  if (!updatedState.isFinalRound) {
    const elapsedMinutes = (Date.now() - updatedState.gameStartTime) / (1000 * 60);
    if (elapsedMinutes >= CLOCK_CAP_MINUTES) {
      updatedState = { ...updatedState, isFinalRound: true };
    }
  }

  // Check game end conditions
  const gameEnd = checkGameEnd(updatedState);
  if (gameEnd) return gameEnd;

  // Advance to next active player
  let nextIdx = (updatedState.currentPlayerIndex + 1) % updatedState.players.length;
  let nextRound = updatedState.round;

  // Skip bankrupt players
  let safety = 0;
  while (updatedState.players[nextIdx].isBankrupt && safety < updatedState.players.length) {
    nextIdx = (nextIdx + 1) % updatedState.players.length;
    safety++;
  }

  // New round: find the first active (non-bankrupt) player index
  const firstActiveIdx = updatedState.players.findIndex(p => !p.isBankrupt);
  // A new round starts when we wrap back to (or past) the first active player
  if (nextIdx <= updatedState.currentPlayerIndex && firstActiveIdx !== -1) {
    // Only increment if we truly wrapped around past the first active player
    if (nextIdx <= firstActiveIdx || updatedState.currentPlayerIndex >= firstActiveIdx) {
      nextRound++;
    }
  }

  if (nextRound > updatedState.maxRounds) {
    return { ...updatedState, phase: 'FINISHED' };
  }

  return {
    ...updatedState,
    currentPlayerIndex: nextIdx,
    round: nextRound,
    turnPhase: 'ROLL_PHASE',
    pendingTileEvent: null,
    currentChallenge: null,
  };
}

// ---- BANKRUPTCY & GAME END ----

function checkBankruptcy(state: GameState): GameState {
  const updatedPlayers = state.players.map((p) => {
    if (p.isBankrupt) return p;
    if (p.money < 0 && p.properties.length === 0) {
      return { ...p, isBankrupt: true };
    }
    // Auto-sell cheapest property if negative money
    if (p.money < 0 && p.properties.length > 0) {
      const sortedProps = [...p.properties].sort((a, b) => {
        const tileA = BOARD_TILES[a];
        const tileB = BOARD_TILES[b];
        return (tileA?.price ?? 0) - (tileB?.price ?? 0);
      });
      const sellIdx = sortedProps[0];
      const sellTile = BOARD_TILES[sellIdx];
      const sellPrice = Math.floor((sellTile?.price ?? 0) * 0.5);
      return {
        ...p,
        money: p.money + sellPrice,
        properties: p.properties.filter((idx) => idx !== sellIdx),
      };
    }
    return p;
  });

  // Update property ownership for sold properties
  const ownedByPlayers = new Set(updatedPlayers.flatMap((p) => p.properties));
  const updatedProperties = state.properties.map((prop) => {
    if (prop.ownerId && !ownedByPlayers.has(prop.tileIndex)) {
      return { ...prop, ownerId: null, isLeveledUp: false };
    }
    return prop;
  });

  return { ...state, players: updatedPlayers, properties: updatedProperties };
}

/** Returns a FINISHED state if the game is over, otherwise null. */
function checkGameEnd(state: GameState): GameState | null {
  const activePlayers = getActivePlayers(state);

  // Last player standing
  if (activePlayers.length <= 1) {
    return { ...state, phase: 'FINISHED' };
  }

  // Round cap
  if (state.round > state.maxRounds) {
    return { ...state, phase: 'FINISHED' };
  }

  // Clock cap reached and the last active player has now had their turn
  if (state.isFinalRound) {
    const lastActiveIdx = state.players.reduce(
      (last, p, i) => (p.isBankrupt ? last : i),
      -1
    );
    if (state.currentPlayerIndex >= lastActiveIdx) {
      return { ...state, phase: 'FINISHED' };
    }
  }

  return null;
}

// ---- SCORING ----

export function calculateFinalScores(state: GameState): FinalScore[] {
  const scores: FinalScore[] = state.players.map((p) => {
    const propertyValue = calculatePropertyValue(p.properties);
    const levelUpValue = calculateLevelUpValue(p.properties, state.properties);
    const netWorth = p.money + propertyValue + levelUpValue;

    return {
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      isBot: p.isBot,
      cash: p.money,
      propertyValue,
      levelUpValue,
      netWorth,
      totalCorrect: p.totalCorrect,
      totalQuestions: p.totalQuestions,
      rank: 0,
    };
  });

  // Rank by net worth (highest first)
  scores.sort((a, b) => b.netWorth - a.netWorth);
  scores.forEach((s, i) => { s.rank = i + 1; });

  return scores;
}

export function generateMasteryReport(player: PlayerState): MasteryReport {
  const skills = SKILL_NAMES.map((s) => ({
    skillName: s,
    mastery: player.masteryStates[s] ?? INITIAL_MASTERY,
    totalAttempts: 0, // Would need per-skill tracking; approximate from overall
    totalCorrect: 0,
  }));

  const sortedSkills = [...skills].sort((a, b) => b.mastery - a.mastery);

  return {
    playerId: player.id,
    playerName: player.name,
    skills,
    bestSkill: sortedSkills[0].skillName,
    weakestSkill: sortedSkills[sortedSkills.length - 1].skillName,
    overallAccuracy: player.totalQuestions > 0 ? player.totalCorrect / player.totalQuestions : 0,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function updatePlayerInList(
  players: PlayerState[],
  index: number,
  updater: (p: PlayerState) => PlayerState
): PlayerState[] {
  return players.map((p, i) => (i === index ? updater(p) : p));
}

function updatePlayerMoney(state: GameState, playerIdx: number, amount: number): GameState {
  return {
    ...state,
    players: updatePlayerInList(state.players, playerIdx, (p) => ({
      ...p,
      money: p.money + amount,
    })),
  };
}

function updatePlayerMastery(
  player: PlayerState,
  skill: SkillName,
  isCorrect: boolean,
  difficulty: 1 | 2 | 3
): { newMastery: number; previousMastery: number } {
  const previousMastery = player.masteryStates[skill] ?? INITIAL_MASTERY;
  const params = getAdjustedParams(difficulty);
  const newMastery = updateMastery(previousMastery, isCorrect, params);
  return { newMastery, previousMastery };
}

/**
 * The bookkeeping every answer produces, wherever it happened. Returned as a
 * patch so callers can merge it alongside their own changes (money, position).
 *
 * `skillAttempts` is incremented here so difficulty gating sees the observation
 * immediately, in the same tick BKT updates.
 */
function applyAnswerToPlayer(
  player: PlayerState,
  skillName: string,
  isCorrect: boolean,
  newMastery: number
): Partial<PlayerState> {
  return {
    totalQuestions: player.totalQuestions + 1,
    totalCorrect: isCorrect ? player.totalCorrect + 1 : player.totalCorrect,
    streak: isCorrect ? player.streak + 1 : 0,
    masteryStates: { ...player.masteryStates, [skillName]: newMastery },
    skillAttempts: {
      ...player.skillAttempts,
      [skillName]: (player.skillAttempts[skillName] ?? 0) + 1,
    },
    consecutiveFailures: {
      ...player.consecutiveFailures,
      [skillName]: isCorrect ? 0 : (player.consecutiveFailures[skillName] ?? 0) + 1,
    },
  };
}

function updatePlayerAfterAnswer(
  state: GameState,
  isCorrect: boolean,
  challenge: { skillName: string },
  newMastery: number
): PlayerState[] {
  return updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    ...applyAnswerToPlayer(p, challenge.skillName, isCorrect, newMastery),
  }));
}

function buildAnswerResult(
  isCorrect: boolean,
  challenge: { options: string[]; correctIndex: number; skillName: string },
  newMastery: number,
  previousMastery: number,
  reward: RewardResult,
  player: PlayerState
): AnswerResult {
  return {
    isCorrect,
    correctAnswer: challenge.options[challenge.correctIndex],
    newMastery,
    previousMastery,
    reward,
    streakCount: isCorrect ? player.streak + 1 : 0,
    streakBroken: !isCorrect && player.streak > 0,
    showHintNext: !isCorrect && (player.consecutiveFailures[challenge.skillName] ?? 0) >= 1,
    timedOut: false,
  };
}
