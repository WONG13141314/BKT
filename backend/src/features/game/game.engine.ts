// ============================================
// Game Engine — MathOpoly Redesign
// New turn state machine, 20-tile board, no houses/hotels
// Level Up system, challenge cards, RM currency
// ============================================

import {
  GameState,
  PlayerState,
  PropertyState,
  TurnPhase,
  ChallengeContext,
  AnswerResult,
  RewardResult,
  TileEvent,
  FinalScore,
  MasteryReport,
  LuckyBreakReward,
  ChallengeCard,
  CardEffect,
} from './game.types';
import { SKILL_NAMES, SkillName } from './game.constants';
import {
  BOARD_TILES,
  COLOR_GROUPS,
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
  DICE_CHALLENGE_PROBABILITY,
  DICE_CHALLENGE_BONUS,
  SMART_BUY_DISCOUNT,
  RENT_DEFENSE_DISCOUNT,
  LUCKY_BREAK_CASH_OPTIONS,
  LUCKY_BREAK_TOKEN_CHANCE,
  formatRM,
} from './game.constants';
import { createShuffledDeck, drawCard } from './card.deck';
import { updateMastery } from '../../bkt/bkt.engine';
import { selectChallenge, getAdjustedParams } from '../../bkt/bkt.selector';
import { clampProbability } from '../../bkt/bkt.utils';
import { INITIAL_MASTERY } from '../../bkt/bkt.defaults';

// ============================================
// GAME INITIALIZATION
// ============================================

export function initializeGameState(
  gameId: string,
  players: { id: string; userId: string; name: string; color: string; order: number; isBot?: boolean; botDifficulty?: 'easy' | 'medium' | 'hard' }[]
): GameState {
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    userId: p.userId,
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
    masteryStates: Object.fromEntries(SKILL_NAMES.map((s) => [s, INITIAL_MASTERY])),
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
    players: playerStates,
    tiles: BOARD_TILES,
    properties: initializeProperties(),
    currentPlayerIndex: 0,
    phase: 'PLAYING',
    turnPhase: 'ROLL_PHASE',
    round: 1,
    maxRounds: MAX_ROUNDS,
    diceValues: [1, 1],
    currentChallenge: null,
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
 * Start the roll phase. If player is jailed, redirect to jail decision.
 * Otherwise roll dice and check for dice mini-challenge (1-in-3 chance).
 */
export function startRollPhase(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // If player is in jail → jail decision instead
  if (player.isInJail) {
    return { ...state, turnPhase: 'JAIL_DECISION' };
  }

  // Roll 2d6
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;

  const newState: GameState = {
    ...state,
    diceValues: [die1, die2],
  };

  // 1-in-3 chance of dice mini-challenge
  if (Math.random() < DICE_CHALLENGE_PROBABILITY) {
    const challenge = selectChallenge({
      masteryStates: player.masteryStates,
      context: 'DICE_CHALLENGE',
      consecutiveFailures: player.consecutiveFailures,
      diceValues: [die1, die2],
    });

    return {
      ...newState,
      turnPhase: 'DICE_CHALLENGE',
      currentChallenge: challenge,
    };
  }

  // No challenge → move directly
  return {
    ...newState,
    turnPhase: 'MOVING',
  };
}

// ---- DICE CHALLENGE ANSWER ----

export function processDiceChallengeAnswer(
  state: GameState,
  selectedIndex: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  // Update BKT mastery
  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  // Reward: RM20 bonus for correct, nothing for wrong
  const reward: RewardResult = isCorrect
    ? { type: 'BONUS_CASH', value: DICE_CHALLENGE_BONUS, description: `Correct! +${formatRM(DICE_CHALLENGE_BONUS)} bonus!` }
    : { type: 'NONE', value: 0, description: 'No bonus this time.' };

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: isCorrect ? p.money + DICE_CHALLENGE_BONUS : p.money,
    totalQuestions: p.totalQuestions + 1,
    totalCorrect: isCorrect ? p.totalCorrect + 1 : p.totalCorrect,
    streak: isCorrect ? p.streak + 1 : 0,
    masteryStates: { ...p.masteryStates, [challenge.skillName]: newMastery },
    consecutiveFailures: {
      ...p.consecutiveFailures,
      [challenge.skillName]: isCorrect ? 0 : (p.consecutiveFailures[challenge.skillName] ?? 0) + 1,
    },
  }));

  const result: AnswerResult = {
    isCorrect,
    correctAnswer: challenge.options[challenge.correctIndex],
    newMastery,
    previousMastery,
    reward,
    streakCount: isCorrect ? (player.streak + 1) : 0,
    streakBroken: !isCorrect && player.streak > 0,
    showHintNext: !isCorrect && (player.consecutiveFailures[challenge.skillName] ?? 0) >= 1,
  };

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      turnPhase: 'MOVING',
      currentChallenge: null,
    },
    result,
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
      return resolveTaxTile(state, player, tile.index);

    case 'CHALLENGE_CARD':
      return resolveChallengeCardTile(state, player);

    case 'LUCKY_BREAK':
      return resolveLuckyBreak(state, player);

    case 'REST':
      return { ...state, turnPhase: 'END_TURN' };

    case 'GO_TO_JAIL':
      return resolveGoToJail(state, player);

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

  return {
    ...state,
    turnPhase: 'RENT_PAYMENT',
    pendingTileEvent: event,
  };
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
export function payFullRent(state: GameState): GameState {
  const event = state.pendingTileEvent!;
  const rent = event.rentAmount!;

  return transferRent(state, rent);
}

/** Player opts into Rent Defense challenge */
export function startRentDefense(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  const tile = BOARD_TILES[event.tileIndex];

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'RENT_DEFENSE',
    consecutiveFailures: player.consecutiveFailures,
    rentAmount: event.rentAmount,
    propertySkillTheme: tile?.skillTheme as SkillName | undefined,
  });

  return {
    ...state,
    turnPhase: 'RENT_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process Rent Defense answer */
export function processRentDefenseAnswer(
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

  const fullRent = event.rentAmount!;
  const halfRent = Math.floor(fullRent * RENT_DEFENSE_DISCOUNT);
  const actualRent = isCorrect ? halfRent : fullRent;

  const reward: RewardResult = isCorrect
    ? { type: 'RENT_HALF', value: halfRent, description: `Defense successful! Pay only ${formatRM(halfRent)} instead of ${formatRM(fullRent)}!` }
    : { type: 'NONE', value: 0, description: `Full rent: ${formatRM(fullRent)}` };

  const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
  const stateAfterAnswer = { ...state, players: updatedPlayers, currentChallenge: null };
  const finalState = transferRent(stateAfterAnswer, actualRent);

  return {
    newState: { ...finalState, pendingTileEvent: null },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player),
  };
}

function transferRent(state: GameState, rent: number): GameState {
  const event = state.pendingTileEvent!;
  const payerIdx = state.currentPlayerIndex;
  const ownerIdx = state.players.findIndex((p) => p.id === event.propertyOwner);

  if (ownerIdx === -1) return { ...state, turnPhase: 'END_TURN', pendingTileEvent: null };

  const updatedPlayers = state.players.map((p, idx) => {
    if (idx === payerIdx) return { ...p, money: p.money - rent };
    if (idx === ownerIdx) return { ...p, money: p.money + rent };
    return p;
  });

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
    pendingTileEvent: null,
  };
}

// ---- TAX ----

function resolveTaxTile(state: GameState, player: PlayerState, tileIndex: number): GameState {
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
  const card = state.pendingTileEvent!.card!;
  const isCorrect = selectedIndex === challenge.correctIndex;

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty
  );

  const effect = isCorrect ? card.correctReward! : card.wrongOutcome!;
  const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);
  let stateAfterEffect = { ...state, players: updatedPlayers };
  stateAfterEffect = applyCardEffect(stateAfterEffect, effect, getCurrentPlayer(stateAfterEffect));

  const reward: RewardResult = isCorrect
    ? { type: 'BONUS_CASH', value: 0, description: `${card.name} — Correct! ${describeEffect(effect)}` }
    : { type: 'NONE', value: 0, description: `${card.name} — ${describeEffect(effect)}` };

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

function resolveGoToJail(state: GameState, player: PlayerState): GameState {
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

  const reward: RewardResult = isCorrect
    ? { type: 'JAIL_BREAK', value: 0, description: 'You escaped jail! Take your turn!' }
    : { type: 'NONE', value: 0, description: 'Still in jail. Better luck next turn!' };

  let updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery);

  if (isCorrect) {
    // Freed! Player gets a normal turn
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      isInJail: false,
      jailTurns: 0,
    }));

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
    // Stay jailed, increment jail turns
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      jailTurns: p.jailTurns + 1,
    }));

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
    ? { type: 'LEVEL_UP', value: 0, description: `${event.tileName} leveled up! ⭐ Rent increased!` }
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

  // Clock cap
  const elapsedMs = Date.now() - state.gameStartTime;
  const elapsedMinutes = elapsedMs / (1000 * 60);
  if (elapsedMinutes >= CLOCK_CAP_MINUTES && !state.isFinalRound) {
    return { ...state, isFinalRound: true };
  }

  // Final round complete
  if (state.isFinalRound && state.currentPlayerIndex === state.players.length - 1) {
    return { ...state, phase: 'FINISHED' };
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

function updatePlayerAfterAnswer(
  state: GameState,
  isCorrect: boolean,
  challenge: { skillName: string },
  newMastery: number
): PlayerState[] {
  return updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    totalQuestions: p.totalQuestions + 1,
    totalCorrect: isCorrect ? p.totalCorrect + 1 : p.totalCorrect,
    streak: isCorrect ? p.streak + 1 : 0,
    masteryStates: { ...p.masteryStates, [challenge.skillName]: newMastery },
    consecutiveFailures: {
      ...p.consecutiveFailures,
      [challenge.skillName]: isCorrect ? 0 : (p.consecutiveFailures[challenge.skillName] ?? 0) + 1,
    },
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
  };
}
