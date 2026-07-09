// ============================================
// Game Engine — Core Game Logic
// Turn flow, tile events, rewards, penalties
// ============================================

import {
  GameState,
  PlayerState,
  PropertyState,
  TurnPhase,
  ChallengeContext,
  AnswerResult,
  RewardResult,
  PenaltyResult,
  MilestoneResult,
  TileEvent,
  FinalScore,
  GAME_CONSTANTS,
} from './game.types';
import { BOARD_TILES, calculateRent, calculatePropertyValue, calculateBuildingValue, ownsFullColorGroup, COLOR_GROUPS } from './board.config';
import { updateMastery } from '../../bkt/bkt.engine';
import { selectChallenge } from '../../bkt/bkt.selector';
import { getAdjustedParams } from '../../bkt/bkt.selector';
import { clampProbability, checkMastery } from '../../bkt/bkt.utils';

// ============================================
// GAME INITIALIZATION
// ============================================

/**
 * Create the initial game state when a game starts
 */
export function initializeGameState(
  gameId: string,
  players: { id: string; userId: string; name: string; color: string; order: number }[]
): GameState {
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.name,
    position: 0,
    money: GAME_CONSTANTS.STARTING_MONEY,
    color: p.color,
    properties: [],
    isInJail: false,
    jailTurns: 0,
    isInDebt: false,
    streak: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    movementTokens: 0,
    powerCards: [],
    masteryStates: {
      Addition: 0.1,
      Subtraction: 0.1,
      Multiplication: 0.1,
      Division: 0.1,
      Fractions: 0.1,
      Decimals: 0.1,
    },
  }));

  // Sort by order
  playerStates.sort((a, b) => {
    const orderA = players.find((p) => p.id === a.id)!.order;
    const orderB = players.find((p) => p.id === b.id)!.order;
    return orderA - orderB;
  });

  // Initialize property states for all property tiles
  const properties: PropertyState[] = BOARD_TILES
    .filter((t) => t.type === 'PROPERTY')
    .map((t) => ({
      tileIndex: t.index,
      ownerId: null,
      houses: 0,
      hasHotel: false,
    }));

  return {
    id: gameId,
    players: playerStates,
    tiles: BOARD_TILES,
    properties,
    currentPlayerIndex: 0,
    phase: 'PLAYING',
    turnPhase: 'ROLL',
    round: 1,
    maxRounds: GAME_CONSTANTS.MAX_ROUNDS,
    diceValues: [1, 1],
    movementBonus: 0,
    currentChallenge: null,
    pendingTileEvent: null,
    auctionState: null,
  };
}

// ============================================
// TURN FLOW
// ============================================

/**
 * Get the current player
 */
export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

/**
 * Phase 1: ROLL — Player initiates a dice roll
 * Returns a MathChallenge that must be answered before the dice are rolled
 */
export function startRollPhase(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // If player is in jail, handle jail logic instead
  if (player.isInJail) {
    return startJailPhase(state);
  }

  // Generate a math challenge for rolling
  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'ROLL_DICE',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
  };
}

/**
 * Process the dice roll after math challenge is answered
 */
export function rollDice(state: GameState, answerResult: AnswerResult): GameState {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const bonus = answerResult.isCorrect ? 1 : -1;
  const totalMovement = Math.max(2, die1 + die2 + bonus);

  return {
    ...state,
    diceValues: [die1, die2],
    movementBonus: bonus,
    turnPhase: 'MOVING',
  };
}

/**
 * Phase 2: MOVE — Execute player movement
 */
export function movePlayer(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const totalMovement = Math.max(2, state.diceValues[0] + state.diceValues[1] + state.movementBonus);
  const oldPosition = player.position;
  const newPosition = (oldPosition + totalMovement) % GAME_CONSTANTS.TOTAL_TILES;
  const passedGo = newPosition < oldPosition; // Wrapped around the board

  // Update player position
  const updatedPlayers = state.players.map((p, idx) => {
    if (idx !== state.currentPlayerIndex) return p;
    return {
      ...p,
      position: newPosition,
      // Passing GO salary handled separately after potential challenge
      money: passedGo ? p.money + getGoSalary(p) : p.money,
    };
  });

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'TILE_EVENT',
  };
}

/**
 * Phase 3: TILE_EVENT — Resolve what happens on the landed tile
 */
export function resolveTileEvent(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const tile = BOARD_TILES[player.position];

  if (!tile) {
    return { ...state, turnPhase: 'ACTION' };
  }

  switch (tile.type) {
    case 'GO':
      // Already handled in move phase
      return { ...state, turnPhase: 'ACTION' };

    case 'PROPERTY':
      return resolvePropertyTile(state, player, tile.index);

    case 'TAX':
      return resolveTaxTile(state, player, tile.index);

    case 'CHANCE':
    case 'COMMUNITY_CHEST':
      return resolveCardTile(state, player, tile.type);

    case 'FREE_PARKING':
      return resolveFreeParkingTile(state, player);

    case 'GO_TO_JAIL':
      return resolveGoToJail(state, player);

    case 'JAIL':
      // "Just Visiting" — no action
      return { ...state, turnPhase: 'ACTION' };

    default:
      return { ...state, turnPhase: 'ACTION' };
  }
}

// ============================================
// TILE EVENT HANDLERS
// ============================================

/**
 * Handle landing on a property tile
 */
function resolvePropertyTile(state: GameState, player: PlayerState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const property = state.properties.find((p) => p.tileIndex === tileIndex);

  if (!property) {
    return { ...state, turnPhase: 'ACTION' };
  }

  // Unowned property → buy opportunity with math challenge
  if (property.ownerId === null) {
    if (player.money >= tile.price && !player.isInDebt) {
      const challenge = selectChallenge({
        masteryStates: player.masteryStates,
        context: 'BUY_PROPERTY',
        consecutiveFailures: getConsecutiveFailures(player),
        recentlySeenSkills: [],
        playerMoney: player.money,
        propertyPrice: tile.price,
      });

      return {
        ...state,
        turnPhase: 'MATH_CHALLENGE',
        currentChallenge: challenge,
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex,
          tileName: tile.name,
          propertyPrice: tile.price,
          propertyOwner: null,
        },
      };
    }
    // Can't afford → skip to action phase
    return { ...state, turnPhase: 'ACTION' };
  }

  // Owned by another player → pay rent with math challenge
  if (property.ownerId !== player.id) {
    const owner = state.players.find((p) => p.id === property.ownerId);
    if (!owner) return { ...state, turnPhase: 'ACTION' };

    const rentAmount = calculateRent(tile, property.houses, property.hasHotel);

    const challenge = selectChallenge({
      masteryStates: player.masteryStates,
      context: 'PAY_RENT',
      consecutiveFailures: getConsecutiveFailures(player),
      recentlySeenSkills: [],
      rentBase: tile.baseRent,
      rentHouses: property.houses,
    });

    return {
      ...state,
      turnPhase: 'MATH_CHALLENGE',
      currentChallenge: challenge,
      pendingTileEvent: {
        type: 'PROPERTY',
        tileIndex,
        tileName: tile.name,
        propertyOwner: property.ownerId,
        rentAmount,
      },
    };
  }

  // Owned by this player → no action needed
  return { ...state, turnPhase: 'ACTION' };
}

/**
 * Handle landing on a tax tile
 */
function resolveTaxTile(state: GameState, player: PlayerState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const taxType: 'INCOME' | 'LUXURY' = tileIndex === 4 ? 'INCOME' : 'LUXURY';
  const totalAssets = player.money + calculatePropertyValue(player.properties);
  const taxAmount = taxType === 'INCOME'
    ? Math.round(totalAssets * 0.10)
    : 75;

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'TAX',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
    taxTotalAssets: totalAssets,
    taxType,
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: 'TAX',
      tileIndex,
      tileName: tile.name,
      taxAmount,
      taxType,
    },
  };
}

/**
 * Handle landing on a Chance or Community Chest tile
 * Simplified: generates a random math challenge with a money reward/penalty
 */
function resolveCardTile(state: GameState, player: PlayerState, cardType: 'CHANCE' | 'COMMUNITY_CHEST'): GameState {
  const context: ChallengeContext = cardType === 'CHANCE' ? 'CHANCE_CARD' : 'COMMUNITY_CHEST';

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context,
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
  });

  // Generate a random card effect
  const cardEffects = cardType === 'CHANCE'
    ? CHANCE_EFFECTS
    : COMMUNITY_CHEST_EFFECTS;
  const effect = cardEffects[Math.floor(Math.random() * cardEffects.length)];

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: cardType,
      tileIndex: player.position,
      tileName: cardType === 'CHANCE' ? 'Chance' : 'Community Chest',
      card: {
        id: `card_${Date.now()}`,
        title: effect.title,
        description: effect.description,
        mathContext: challenge.text,
        effect: effect.effect,
      },
    },
  };
}

/**
 * Handle landing on Free Parking (Knowledge Boost)
 * Bonus round: 3 rapid-fire questions
 */
function resolveFreeParkingTile(state: GameState, player: PlayerState): GameState {
  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'FREE_PARKING',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: 'FREE_PARKING',
      tileIndex: player.position,
      tileName: 'Knowledge Boost',
    },
  };
}

/**
 * Handle landing on Go To Jail
 */
function resolveGoToJail(state: GameState, player: PlayerState): GameState {
  // Plea bargain: answer correctly to reduce jail time
  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'JAIL_ESCAPE',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: 'GO_TO_JAIL',
      tileIndex: player.position,
      tileName: 'Go To Jail',
    },
  };
}

/**
 * Handle jail escape attempts
 */
function startJailPhase(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // Auto-release after max jail turns
  if (player.jailTurns >= GAME_CONSTANTS.MAX_JAIL_TURNS) {
    const updatedPlayers = state.players.map((p, idx) => {
      if (idx !== state.currentPlayerIndex) return p;
      return {
        ...p,
        isInJail: false,
        jailTurns: 0,
        money: p.money - GAME_CONSTANTS.BAIL_COST, // Auto-pay bail
      };
    });

    return {
      ...state,
      players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
      turnPhase: 'ROLL',
    };
  }

  // Offer math challenge to escape
  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'JAIL_ESCAPE',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: 'JAIL',
      tileIndex: 7, // Jail tile index
      tileName: 'Jail Escape',
    },
  };
}

// ============================================
// ANSWER PROCESSING
// ============================================

/**
 * Process a player's answer to a math challenge
 * Updates BKT, applies rewards/penalties, modifies game state
 */
export function processAnswer(
  state: GameState,
  selectedAnswer: number,
  timeMs: number
): { newState: GameState; result: AnswerResult } {
  const challenge = state.currentChallenge;
  if (!challenge) {
    throw new Error('No active challenge to answer');
  }

  const player = getCurrentPlayer(state);
  const isCorrect = selectedAnswer === challenge.correctIndex;

  // 1. BKT Update
  const currentMastery = player.masteryStates[challenge.skillName] ?? 0.1;
  const adjustedParams = getAdjustedParams(challenge.difficulty);
  const newMastery = updateMastery(currentMastery, isCorrect, adjustedParams);

  // 2. Update streak
  const newStreak = isCorrect ? player.streak + 1 : 0;
  const streakBroken = !isCorrect && player.streak > 0;

  // 3. Calculate reward/penalty
  const reward = calculateReward(isCorrect, challenge.context, state, newStreak);
  const penalty = isCorrect ? null : calculatePenalty(challenge.context, state);

  // 4. Check milestones
  const milestones = checkMilestones(currentMastery, newMastery, challenge.skillName);

  // 5. Determine hint for next time
  const consecutiveFailures = getConsecutiveFailures(player);
  const newFailures = isCorrect ? 0 : (consecutiveFailures[challenge.skillName] ?? 0) + 1;
  const showHintNext = newFailures >= 2 || newMastery < 0.15;

  // 6. Apply game state changes
  let updatedPlayers = state.players.map((p, idx) => {
    if (idx !== state.currentPlayerIndex) return p;
    return {
      ...p,
      masteryStates: {
        ...p.masteryStates,
        [challenge.skillName]: newMastery,
      },
      streak: newStreak,
      totalCorrect: isCorrect ? p.totalCorrect + 1 : p.totalCorrect,
      totalQuestions: p.totalQuestions + 1,
      movementTokens: reward.type === 'MOVEMENT'
        ? p.movementTokens + reward.value
        : p.movementTokens,
      money: applyMoneyChange(p.money, reward, penalty),
    };
  });

  // Apply milestone bonuses
  for (const milestone of milestones) {
    updatedPlayers = updatedPlayers.map((p, idx) => {
      if (idx !== state.currentPlayerIndex) return p;
      return { ...p, money: p.money + milestone.cashBonus };
    });
  }

  const result: AnswerResult = {
    isCorrect,
    correctAnswer: challenge.options[challenge.correctIndex],
    newMastery,
    previousMastery: currentMastery,
    reward,
    penalty,
    milestones,
    streakCount: newStreak,
    streakBroken,
    showHintNext,
  };

  // 7. Determine next turn phase based on context
  const nextState = resolvePostAnswer(
    { ...state, players: updatedPlayers, currentChallenge: null },
    challenge.context,
    isCorrect
  );

  return { newState: nextState, result };
}

/**
 * Determine what happens after answering a challenge
 */
function resolvePostAnswer(
  state: GameState,
  context: ChallengeContext,
  isCorrect: boolean
): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent;

  switch (context) {
    case 'ROLL_DICE': {
      // Roll the dice now
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const bonus = isCorrect ? 1 : -1;

      return {
        ...state,
        diceValues: [die1, die2],
        movementBonus: bonus,
        turnPhase: 'MOVING',
        pendingTileEvent: null,
      };
    }

    case 'BUY_PROPERTY': {
      if (!event) return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };

      const tile = BOARD_TILES[event.tileIndex];
      const discount = isCorrect ? GAME_CONSTANTS.MATH_DISCOUNT_PERCENT / 100 : 0;
      const finalPrice = Math.round(tile.price * (1 - discount));

      // Buy the property
      const updatedPlayers = state.players.map((p, idx) => {
        if (idx !== state.currentPlayerIndex) return p;
        return {
          ...p,
          money: p.money - finalPrice,
          properties: [...p.properties, event.tileIndex],
        };
      });

      const updatedProperties = state.properties.map((prop) => {
        if (prop.tileIndex !== event.tileIndex) return prop;
        return { ...prop, ownerId: player.id };
      });

      return {
        ...state,
        players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
        properties: updatedProperties,
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    case 'PAY_RENT': {
      if (!event || !event.rentAmount || !event.propertyOwner) {
        return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };
      }

      const discount = isCorrect ? GAME_CONSTANTS.RENT_DISCOUNT_PERCENT / 100 : 0;
      const finalRent = Math.round(event.rentAmount * (1 - discount));

      const updatedPlayers = state.players.map((p, idx) => {
        if (idx === state.currentPlayerIndex) {
          return { ...p, money: p.money - finalRent };
        }
        if (p.id === event.propertyOwner) {
          return { ...p, money: p.money + finalRent };
        }
        return p;
      });

      return {
        ...state,
        players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    case 'TAX': {
      if (!event || event.taxAmount == null) {
        return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };
      }

      const discount = isCorrect ? GAME_CONSTANTS.TAX_DISCOUNT_PERCENT / 100 : 0;
      const finalTax = Math.round(event.taxAmount * (1 - discount));

      const updatedPlayers = state.players.map((p, idx) => {
        if (idx !== state.currentPlayerIndex) return p;
        return { ...p, money: p.money - finalTax };
      });

      return {
        ...state,
        players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    case 'CHANCE_CARD':
    case 'COMMUNITY_CHEST': {
      if (!event?.card) {
        return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };
      }

      const effect = event.card.effect;
      const effectMultiplier = isCorrect ? 1 : 0.5; // Wrong = half benefit

      let updatedState = { ...state };

      switch (effect.type) {
        case 'GAIN_MONEY': {
          const amount = Math.round(effect.amount * effectMultiplier);
          updatedState = applyMoney(updatedState, state.currentPlayerIndex, amount);
          break;
        }
        case 'LOSE_MONEY': {
          // Never lose money for wrong answers on cards
          if (isCorrect) {
            // Correct = don't lose money (you solved the problem!)
          } else {
            updatedState = applyMoney(updatedState, state.currentPlayerIndex, -effect.amount);
          }
          break;
        }
        case 'MOVE_FORWARD': {
          const spaces = Math.round(effect.spaces * effectMultiplier);
          const newPos = (player.position + spaces) % GAME_CONSTANTS.TOTAL_TILES;
          updatedState = {
            ...updatedState,
            players: updatedState.players.map((p, idx) => {
              if (idx !== state.currentPlayerIndex) return p;
              return { ...p, position: newPos };
            }),
          };
          break;
        }
        case 'COLLECT_FROM_EACH': {
          const amount = Math.round(effect.amount * effectMultiplier);
          updatedState = {
            ...updatedState,
            players: updatedState.players.map((p, idx) => {
              if (idx === state.currentPlayerIndex) {
                return { ...p, money: p.money + amount * (state.players.length - 1) };
              }
              return { ...p, money: p.money - amount };
            }),
          };
          break;
        }
        case 'GO_TO_JAIL': {
          if (!isCorrect) {
            updatedState = sendToJail(updatedState, state.currentPlayerIndex);
          }
          // If correct, avoid jail!
          break;
        }
        default:
          break;
      }

      return {
        ...updatedState,
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    case 'JAIL_ESCAPE': {
      if (isCorrect) {
        // Escape jail!
        const updatedPlayers = state.players.map((p, idx) => {
          if (idx !== state.currentPlayerIndex) return p;
          return {
            ...p,
            isInJail: false,
            jailTurns: 0,
            money: p.money + 25, // "Redeemed" bonus
          };
        });
        return {
          ...state,
          players: updatedPlayers,
          turnPhase: 'ROLL',
          pendingTileEvent: null,
        };
      } else {
        // Stay in jail
        if (event?.type === 'GO_TO_JAIL') {
          // Coming from Go To Jail tile — send to jail with standard sentence
          return {
            ...sendToJail(state, state.currentPlayerIndex),
            turnPhase: 'END',
            pendingTileEvent: null,
          };
        }
        // Already in jail — increment turns
        const updatedPlayers = state.players.map((p, idx) => {
          if (idx !== state.currentPlayerIndex) return p;
          return { ...p, jailTurns: p.jailTurns + 1 };
        });
        return {
          ...state,
          players: updatedPlayers,
          turnPhase: 'END',
          pendingTileEvent: null,
        };
      }
    }

    case 'FREE_PARKING': {
      // Each correct answer = $30, handled by the reward system
      return {
        ...state,
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    case 'BUILD_HOUSE':
    case 'BUILD_HOTEL': {
      if (!event) return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };

      const tile = BOARD_TILES[event.tileIndex];
      const discount = isCorrect ? GAME_CONSTANTS.BUILD_DISCOUNT_PERCENT / 100 : 0;
      const finalCost = Math.round(tile.houseCost * (1 - discount));

      const updatedPlayers = state.players.map((p, idx) => {
        if (idx !== state.currentPlayerIndex) return p;
        return { ...p, money: p.money - finalCost };
      });

      const updatedProperties = state.properties.map((prop) => {
        if (prop.tileIndex !== event.tileIndex) return prop;
        if (context === 'BUILD_HOTEL') {
          return { ...prop, houses: 0, hasHotel: true };
        }
        return { ...prop, houses: prop.houses + 1 };
      });

      return {
        ...state,
        players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
        properties: updatedProperties,
        turnPhase: 'ACTION',
        pendingTileEvent: null,
      };
    }

    default:
      return { ...state, turnPhase: 'ACTION', pendingTileEvent: null };
  }
}

// ============================================
// BUILDING
// ============================================

/**
 * Attempt to build a house on a property
 * Returns a MathChallenge that determines discount
 */
export function startBuildHouse(state: GameState, tileIndex: number): GameState | null {
  const player = getCurrentPlayer(state);
  const tile = BOARD_TILES[tileIndex];
  const property = state.properties.find((p) => p.tileIndex === tileIndex);

  if (!tile || !property) return null;
  if (property.ownerId !== player.id) return null;
  if (property.houses >= GAME_CONSTANTS.MAX_HOUSES) return null;
  if (property.hasHotel) return null;
  if (player.isInDebt) return null;

  // Must own full color group
  if (!tile.colorGroup || !ownsFullColorGroup(player.properties, tile.colorGroup)) return null;

  // Must afford at least the discounted price
  const minCost = Math.round(tile.houseCost * (1 - GAME_CONSTANTS.BUILD_DISCOUNT_PERCENT / 100));
  if (player.money < minCost) return null;

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'BUILD_HOUSE',
    consecutiveFailures: getConsecutiveFailures(player),
    recentlySeenSkills: [],
    houseCost: tile.houseCost,
    numHouses: 1,
  });

  return {
    ...state,
    turnPhase: 'MATH_CHALLENGE',
    currentChallenge: challenge,
    pendingTileEvent: {
      type: 'PROPERTY',
      tileIndex,
      tileName: tile.name,
    },
  };
}

// ============================================
// PAY BAIL
// ============================================

/**
 * Player pays bail to leave jail (no math required)
 */
export function payBail(state: GameState): GameState {
  const updatedPlayers = state.players.map((p, idx) => {
    if (idx !== state.currentPlayerIndex) return p;
    return {
      ...p,
      isInJail: false,
      jailTurns: 0,
      money: p.money - GAME_CONSTANTS.BAIL_COST,
    };
  });

  return {
    ...state,
    players: applyDebtCheck(updatedPlayers, state.currentPlayerIndex),
    turnPhase: 'ROLL',
    pendingTileEvent: null,
    currentChallenge: null,
  };
}

// ============================================
// END TURN
// ============================================

/**
 * End the current turn and advance to the next player
 */
export function endTurn(state: GameState): GameState {
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const isNewRound = nextPlayerIndex === 0;
  const newRound = isNewRound ? state.round + 1 : state.round;

  // Check if game is over
  if (newRound > state.maxRounds) {
    return {
      ...state,
      phase: 'FINISHED',
      turnPhase: 'END',
      round: state.maxRounds,
    };
  }

  // Recovery challenge for players in debt
  let updatedPlayers = state.players;
  if (updatedPlayers[nextPlayerIndex].isInDebt) {
    // Recovery bonus applied when they answer during their turn
  }

  return {
    ...state,
    players: updatedPlayers,
    currentPlayerIndex: nextPlayerIndex,
    round: newRound,
    turnPhase: 'ROLL',
    diceValues: [1, 1],
    movementBonus: 0,
    currentChallenge: null,
    pendingTileEvent: null,
    auctionState: null,
  };
}

// ============================================
// SCORING
// ============================================

/**
 * Calculate final scores for all players
 */
export function calculateFinalScores(state: GameState): FinalScore[] {
  const scores: FinalScore[] = state.players.map((player) => {
    // Property value
    const propertyValue = calculatePropertyValue(player.properties);

    // Building value
    const playerProperties = state.properties.filter((p) => p.ownerId === player.id);
    const buildingValue = calculateBuildingValue(
      playerProperties.map((p) => ({
        tileIndex: p.tileIndex,
        houses: p.houses,
        hasHotel: p.hasHotel,
      }))
    );

    // Net worth
    const netWorth = Math.max(0, player.money) + propertyValue + buildingValue;

    // Average mastery
    const masteryValues = Object.values(player.masteryStates);
    const averageMastery = masteryValues.length > 0
      ? masteryValues.reduce((sum, v) => sum + v, 0) / masteryValues.length
      : 0.1;

    // Mastery multiplier: 0.5 + averageMastery (range 0.6–1.5)
    const masteryMultiplier = 0.5 + averageMastery;

    // Math bonus: $10 per correct answer
    const mathBonus = player.totalCorrect * GAME_CONSTANTS.CORRECT_ANSWER_XP;

    // Final score
    const finalScore = Math.round((netWorth * masteryMultiplier) + mathBonus);

    return {
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      cash: player.money,
      propertyValue,
      buildingValue,
      netWorth,
      averageMastery: Math.round(averageMastery * 100) / 100,
      masteryMultiplier: Math.round(masteryMultiplier * 100) / 100,
      totalCorrect: player.totalCorrect,
      mathBonus,
      finalScore,
      rank: 0, // Will be set below
    };
  });

  // Assign ranks
  scores.sort((a, b) => b.finalScore - a.finalScore);
  scores.forEach((score, idx) => {
    score.rank = idx + 1;
  });

  return scores;
}

// ============================================
// REWARDS
// ============================================

function calculateReward(
  isCorrect: boolean,
  context: ChallengeContext,
  state: GameState,
  streak: number
): RewardResult {
  if (!isCorrect) {
    return { type: 'NONE', value: 0, description: '' };
  }

  let reward: RewardResult;

  switch (context) {
    case 'ROLL_DICE':
      reward = {
        type: 'MOVEMENT',
        value: 1,
        description: '🎯 Correct! +1 movement bonus!',
      };
      break;
    case 'BUY_PROPERTY':
      reward = {
        type: 'DISCOUNT',
        value: GAME_CONSTANTS.MATH_DISCOUNT_PERCENT,
        description: `🎯 Correct! ${GAME_CONSTANTS.MATH_DISCOUNT_PERCENT}% discount on this property!`,
      };
      break;
    case 'PAY_RENT':
      reward = {
        type: 'RENT_SHIELD',
        value: GAME_CONSTANTS.RENT_DISCOUNT_PERCENT,
        description: `🎯 Correct! Pay only ${100 - GAME_CONSTANTS.RENT_DISCOUNT_PERCENT}% of the rent!`,
      };
      break;
    case 'BUILD_HOUSE':
    case 'BUILD_HOTEL':
      reward = {
        type: 'DISCOUNT',
        value: GAME_CONSTANTS.BUILD_DISCOUNT_PERCENT,
        description: `🎯 Correct! ${GAME_CONSTANTS.BUILD_DISCOUNT_PERCENT}% off building costs!`,
      };
      break;
    case 'TAX':
      reward = {
        type: 'TAX_RELIEF',
        value: GAME_CONSTANTS.TAX_DISCOUNT_PERCENT,
        description: `🎯 Correct! Pay only ${100 - GAME_CONSTANTS.TAX_DISCOUNT_PERCENT}% of the tax!`,
      };
      break;
    case 'JAIL_ESCAPE':
      reward = {
        type: 'JAIL_BREAK',
        value: 25,
        description: '🎯 Correct! You escaped jail + $25 Redeemed bonus!',
      };
      break;
    case 'FREE_PARKING':
      reward = {
        type: 'BONUS_CASH',
        value: GAME_CONSTANTS.FREE_PARKING_PER_CORRECT,
        description: `🎯 Correct! +$${GAME_CONSTANTS.FREE_PARKING_PER_CORRECT} Knowledge Boost bonus!`,
      };
      break;
    case 'CHANCE_CARD':
    case 'COMMUNITY_CHEST':
      reward = {
        type: 'BONUS_CASH',
        value: 0, // Handled by card effect
        description: '🎯 Correct! Full card benefit unlocked!',
      };
      break;
    default:
      reward = {
        type: 'BONUS_CASH',
        value: 0,
        description: '🎯 Correct!',
      };
  }

  // Streak bonuses
  if (streak === 3) {
    reward.description += ` 🔥 3-streak! +$${GAME_CONSTANTS.STREAK_BONUS_3}!`;
    reward.value += GAME_CONSTANTS.STREAK_BONUS_3;
  } else if (streak === 5) {
    reward.description += ` 🔥🔥 5-streak! +$${GAME_CONSTANTS.STREAK_BONUS_5}!`;
    reward.value += GAME_CONSTANTS.STREAK_BONUS_5;
  } else if (streak === 10) {
    reward.description += ` 🔥🔥🔥 10-streak! +$${GAME_CONSTANTS.STREAK_BONUS_10}!`;
    reward.value += GAME_CONSTANTS.STREAK_BONUS_10;
  }

  return reward;
}

// ============================================
// PENALTIES
// ============================================

function calculatePenalty(
  context: ChallengeContext,
  state: GameState
): PenaltyResult {
  switch (context) {
    case 'ROLL_DICE':
      return {
        type: 'REDUCED_MOVEMENT',
        value: 1,
        description: '❌ Wrong answer. -1 to your dice roll (min 2 movement).',
      };
    case 'BUY_PROPERTY':
      return {
        type: 'NO_DISCOUNT',
        value: 0,
        description: '❌ Wrong answer. No discount — you pay full price.',
      };
    case 'PAY_RENT':
      return {
        type: 'FULL_RENT',
        value: 0,
        description: '❌ Wrong answer. Full rent — no math discount.',
      };
    case 'BUILD_HOUSE':
    case 'BUILD_HOTEL':
      return {
        type: 'NO_DISCOUNT',
        value: 0,
        description: '❌ Wrong answer. No building discount.',
      };
    case 'TAX':
      return {
        type: 'FULL_TAX',
        value: 0,
        description: '❌ Wrong answer. Full tax payment required.',
      };
    case 'JAIL_ESCAPE':
      return {
        type: 'STAY_IN_JAIL',
        value: 1,
        description: '❌ Wrong answer. Stay in jail one more turn.',
      };
    case 'CHANCE_CARD':
    case 'COMMUNITY_CHEST':
      return {
        type: 'REDUCED_BENEFIT',
        value: 50, // 50% of benefit
        description: '❌ Wrong answer. You receive only half the card benefit.',
      };
    default:
      return {
        type: 'NO_DISCOUNT',
        value: 0,
        description: '❌ Wrong answer.',
      };
  }
}

// ============================================
// MILESTONES
// ============================================

function checkMilestones(
  previousMastery: number,
  newMastery: number,
  skillName: string
): MilestoneResult[] {
  const milestones: MilestoneResult[] = [];
  const thresholds = [
    { value: 0.5, label: 'Apprentice', cash: 50, badge: '🥉' },
    { value: 0.7, label: 'Journeyman', cash: 100, badge: '🥈' },
    { value: 0.9, label: 'Master', cash: 200, badge: '🥇' },
  ];

  for (const threshold of thresholds) {
    if (previousMastery < threshold.value && newMastery >= threshold.value) {
      milestones.push({
        skillName,
        threshold: threshold.value,
        label: `${threshold.label} ${skillName}`,
        cashBonus: threshold.cash,
        badge: `${threshold.badge} ${threshold.label} ${skillName}`,
      });
    }
  }

  return milestones;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getGoSalary(player: PlayerState): number {
  const masteryValues = Object.values(player.masteryStates);
  const avgMastery = masteryValues.reduce((s, v) => s + v, 0) / masteryValues.length;

  if (avgMastery > 0.9) return GAME_CONSTANTS.MASTERY_GO_SALARY;
  if (avgMastery > GAME_CONSTANTS.GO_MASTERY_THRESHOLD) return GAME_CONSTANTS.BONUS_GO_SALARY;
  return GAME_CONSTANTS.BASE_GO_SALARY;
}

function getConsecutiveFailures(player: PlayerState): Record<string, number> {
  // In a production system, this would track per-skill consecutive failures
  // For now, derive from streak (streak=0 means at least 1 recent failure)
  const failures: Record<string, number> = {};
  for (const skill of Object.keys(player.masteryStates)) {
    // Players with low mastery and broken streaks likely have failures
    failures[skill] = player.streak === 0 && player.masteryStates[skill] < 0.3 ? 2 : 0;
  }
  return failures;
}

function applyMoney(state: GameState, playerIndex: number, amount: number): GameState {
  const updatedPlayers = state.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    return { ...p, money: p.money + amount };
  });
  return { ...state, players: applyDebtCheck(updatedPlayers, playerIndex) };
}

function applyMoneyChange(
  currentMoney: number,
  reward: RewardResult,
  penalty: PenaltyResult | null
): number {
  let money = currentMoney;

  // Apply reward cash bonuses
  if (reward.type === 'BONUS_CASH') {
    money += reward.value;
  }

  // Streak bonuses are included in reward.value for BONUS_CASH types
  // For other types (DISCOUNT, etc.), the money change is handled in resolvePostAnswer

  return money;
}

/**
 * Check if a player has entered debt mode
 */
function applyDebtCheck(players: PlayerState[], playerIndex: number): PlayerState[] {
  return players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    if (p.money < 0) {
      // Enter debt mode
      if (p.money < GAME_CONSTANTS.MAX_DEBT) {
        // Force liquidation: sell cheapest property
        const cheapest = p.properties
          .map((tileIdx) => ({ tileIdx, price: BOARD_TILES[tileIdx]?.price ?? 0 }))
          .sort((a, b) => a.price - b.price)[0];

        if (cheapest) {
          return {
            ...p,
            isInDebt: true,
            money: p.money + Math.round(cheapest.price * 0.5),
            properties: p.properties.filter((idx) => idx !== cheapest.tileIdx),
          };
        }
      }
      return { ...p, isInDebt: true };
    }
    // If money is positive again, exit debt
    if (p.isInDebt && p.money >= 0) {
      return { ...p, isInDebt: false };
    }
    return p;
  });
}

function sendToJail(state: GameState, playerIndex: number): GameState {
  const updatedPlayers = state.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    return {
      ...p,
      position: 7, // Jail tile index
      isInJail: true,
      jailTurns: 0,
    };
  });
  return { ...state, players: updatedPlayers };
}

// ============================================
// CARD EFFECTS (Chance & Community Chest)
// ============================================

const CHANCE_EFFECTS = [
  { title: 'Bank Error', description: 'The bank made an error in your favour!', effect: { type: 'GAIN_MONEY' as const, amount: 100 } },
  { title: 'Move Forward', description: 'Advance 3 spaces!', effect: { type: 'MOVE_FORWARD' as const, spaces: 3 } },
  { title: 'Treasure Found', description: 'You found a hidden treasure!', effect: { type: 'GAIN_MONEY' as const, amount: 150 } },
  { title: 'Street Repairs', description: 'Pay for street repairs!', effect: { type: 'LOSE_MONEY' as const, amount: 75 } },
  { title: 'Birthday Gift', description: 'Collect $25 from each player!', effect: { type: 'COLLECT_FROM_EACH' as const, amount: 25 } },
  { title: 'Scholarship', description: 'You won a math scholarship!', effect: { type: 'GAIN_MONEY' as const, amount: 200 } },
  { title: 'Go To Jail', description: 'Uh oh! Solve to avoid jail!', effect: { type: 'GO_TO_JAIL' as const } },
  { title: 'Tax Refund', description: 'You got a tax refund!', effect: { type: 'GAIN_MONEY' as const, amount: 80 } },
  { title: 'Lucky Find', description: 'Found money on the ground!', effect: { type: 'GAIN_MONEY' as const, amount: 50 } },
  { title: 'Speed Bonus', description: 'Move forward 5 spaces!', effect: { type: 'MOVE_FORWARD' as const, spaces: 5 } },
];

const COMMUNITY_CHEST_EFFECTS = [
  { title: 'Community Fund', description: 'The community rewards you!', effect: { type: 'GAIN_MONEY' as const, amount: 100 } },
  { title: 'School Prize', description: 'You won a school math prize!', effect: { type: 'GAIN_MONEY' as const, amount: 75 } },
  { title: 'Helping Hands', description: 'Everyone chips in $15!', effect: { type: 'COLLECT_FROM_EACH' as const, amount: 15 } },
  { title: 'Library Bonus', description: 'Extra study paid off!', effect: { type: 'GAIN_MONEY' as const, amount: 60 } },
  { title: 'Doctor Bill', description: 'Small doctor bill to pay.', effect: { type: 'LOSE_MONEY' as const, amount: 50 } },
  { title: 'Savings Reward', description: 'Your savings earned interest!', effect: { type: 'GAIN_MONEY' as const, amount: 40 } },
  { title: 'Class Winner', description: 'You won the class competition!', effect: { type: 'GAIN_MONEY' as const, amount: 120 } },
  { title: 'Charity', description: 'You helped the community!', effect: { type: 'GAIN_MONEY' as const, amount: 30 } },
  { title: 'Good Citizen', description: 'Awarded for being a good citizen!', effect: { type: 'GAIN_MONEY' as const, amount: 90 } },
  { title: 'Lucky Day', description: 'Today is your lucky day!', effect: { type: 'GAIN_MONEY' as const, amount: 55 } },
];
