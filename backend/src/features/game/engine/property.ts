// Property spaces: buying, the Bank Offer question and building a house.

import { GameState, PlayerState, AnswerResult, RewardResult, TileEvent } from '../game.types';
import { SkillName, SMART_BUY_DISCOUNT, DISCOUNT_TOKEN_RATE, formatRM } from '../game.constants';
import { BOARD_TILES, calculateRent, ownsFullColorGroup, getLevelUpCost } from '../board.config';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { buildDuel } from './duel';
import { answerEvidence, buildAnswerResult, getCurrentPlayer, rememberIssuedQuestion, updatePlayerAfterAnswer, updatePlayerInList, updatePlayerMastery } from './players';

// ---- PROPERTY TILE ----

export function resolvePropertyTile(state: GameState, player: PlayerState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const property = state.properties.find((p) => p.tileIndex === tileIndex);

  if (!property) return { ...state, turnPhase: 'END_TURN' };

  // UNOWNED → buy decision
  if (property.ownerId === null) {
    if (!player.isBankrupt) {
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
    // A bankrupt player cannot enter a purchase decision.
    return { ...state, turnPhase: 'END_TURN' };
  }

  // OWN PROPERTY → nothing
  if (property.ownerId === player.id) {
    return { ...state, turnPhase: 'END_TURN' };
  }

  // OPPONENT'S PROPERTY → rent
  const owner = state.players.find((p) => p.id === property.ownerId);
  if (!owner || owner.isBankrupt) return { ...state, turnPhase: 'END_TURN' };

  // A Rent Shield no longer skips the duel: both learners still answer, and
  // the shield cancels only the payment, if one is owed (see `resolveDuel`).
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
  const duelState = buildDuel(player, owner, tile, rent);
  return {
    ...state,
    players: state.players.map((seat) => {
      if (seat.id === duelState.challenger.playerId) return rememberIssuedQuestion(seat, duelState.challenger.challenge);
      if (seat.id === duelState.owner.playerId) return rememberIssuedQuestion(seat, duelState.owner.challenge);
      return seat;
    }),
    turnPhase: 'MATH_DUEL',
    pendingTileEvent: event,
    duelState,
  };
}

// ---- BUY DECISIONS ----

/** Price to pay for the pending deed, and whether the discount token is spent on it. */
export function purchaseQuote(state: GameState): { price: number; usesDiscountToken: boolean } {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  const offerPrice = event.propertyPrice!;
  // Discounts never stack: an approved Bank Offer and a 30% token used to
  // combine to 45% off. The token applies to the listed price, and is spent
  // only when it beats the price already on offer.
  const listedPrice = BOARD_TILES[event.tileIndex]?.price ?? offerPrice;
  const tokenPrice = Math.floor(listedPrice * (1 - DISCOUNT_TOKEN_RATE));
  return player.hasDiscountToken && tokenPrice < offerPrice
    ? { price: tokenPrice, usesDiscountToken: true }
    : { price: offerPrice, usesDiscountToken: false };
}

/** Player buys at the best single price available to them. */
export function buyPropertyFullPrice(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const event = state.pendingTileEvent!;
  const { price, usesDiscountToken: useDiscount } = purchaseQuote(state);

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
  if (event.bankOfferAttempted) return state;
  const tile = BOARD_TILES[event.tileIndex];

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'SMART_BUY',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
    propertySkillTheme: tile?.skillTheme as SkillName | undefined,
    recentQuestionFingerprints: player.recentQuestionFingerprints,
    recentSkillHistory: player.recentIssuedSkills,
    previousDifficultyBySkill: player.lastQuestionDifficulty,
  });

  return {
    ...state,
    players: updatePlayerInList(state.players, state.currentPlayerIndex, (seat) => rememberIssuedQuestion(seat, challenge)),
    turnPhase: 'SMART_BUY_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process Smart Buy answer */
export function processSmartBuyAnswer(
  state: GameState,
  selectedIndex: number | null,
  receivedAt: number = Date.now()
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const event = state.pendingTileEvent!;
  const { isCorrect, timedOut } = answerEvidence(challenge, selectedIndex, receivedAt);

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty, timedOut,
    challenge.hintRequestedAt !== undefined
  );

  const fullPrice = event.propertyPrice!;
  const discountedPrice = Math.floor(fullPrice * (1 - SMART_BUY_DISCOUNT));
  const finalPrice = isCorrect ? discountedPrice : fullPrice;

  const reward: RewardResult = isCorrect
    ? { type: 'DISCOUNT', value: SMART_BUY_DISCOUNT * 100, description: `Bank offer approved! You may buy for ${formatRM(discountedPrice)} instead of ${formatRM(fullPrice)}.` }
    : { type: 'NONE', value: 0, description: `The bank keeps the listed price of ${formatRM(fullPrice)}.` };

  // Return to the deed decision. A player who cannot afford the offer can
  // simply decline it, leaving the property available on a later landing.
  const actualPrice = finalPrice;

  const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery, timedOut);

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      turnPhase: 'BUY_DECISION',
      currentChallenge: null,
      pendingTileEvent: {
        ...event,
        propertyPrice: actualPrice,
        bankOfferAttempted: true,
        bankOfferApproved: isCorrect,
      },
    },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player, timedOut),
  };
}

/** Declining an unowned property leaves it available for a later landing. */
export function skipBuy(state: GameState): GameState {
  if (state.turnPhase !== 'BUY_DECISION') return state;

  return {
    ...state,
    turnPhase: 'END_TURN',
    pendingTileEvent: null,
  };
}

/** Build the game's single house directly as a Monopoly property action. */
export function buildHouse(state: GameState, tileIndex: number): GameState {
  const player = getCurrentPlayer(state);
  const tile = BOARD_TILES[tileIndex];
  const property = state.properties.find((item) => item.tileIndex === tileIndex);

  if (
    !tile ||
    tile.type !== 'PROPERTY' ||
    !tile.colorGroup ||
    !property ||
    property.ownerId !== player.id ||
    property.isLeveledUp ||
    !ownsFullColorGroup(player.properties, tile.colorGroup)
  ) return state;

  const cost = getLevelUpCost(tile);
  const useToken = player.hasLevelUpToken;
  if (!useToken && player.money < cost) return state;

  return {
    ...state,
    players: updatePlayerInList(state.players, state.currentPlayerIndex, (current) => ({
      ...current,
      money: useToken ? current.money : current.money - cost,
      hasLevelUpToken: useToken ? false : current.hasLevelUpToken,
    })),
    properties: state.properties.map((item) =>
      item.tileIndex === tileIndex ? { ...item, isLeveledUp: true } : item
    ),
    pendingTileEvent: {
      type: 'PROPERTY',
      tileIndex,
      tileName: tile.name,
      propertyPrice: cost,
      propertyOwner: player.id,
      isLeveledUp: true,
    },
    turnPhase: 'END_TURN',
  };
}
