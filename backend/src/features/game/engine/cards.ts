// Challenge Cards: drawing, answering and applying their effects.

import { GameState, PlayerState, AnswerResult, RewardResult, TileEvent, CardEffect } from '../game.types';
import { SkillName, GO_SALARY, TOTAL_TILES, formatRM } from '../game.constants';
import { drawCard, getCardById } from '../card.deck';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { sendToJail } from './jail';
import { answerEvidence, buildAnswerResult, getCurrentPlayer, rememberIssuedQuestion, updatePlayerAfterAnswer, updatePlayerInList, updatePlayerMastery, updatePlayerMoney } from './players';

// ---- CHALLENGE CARD ----

export function resolveChallengeCardTile(state: GameState, player: PlayerState): GameState {
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
      recentQuestionFingerprints: player.recentQuestionFingerprints,
      recentSkillHistory: player.recentIssuedSkills,
      previousDifficultyBySkill: player.lastQuestionDifficulty,
    });

    return {
      ...state,
      players: updatePlayerInList(state.players, state.currentPlayerIndex, (seat) => rememberIssuedQuestion(seat, challenge)),
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
  selectedIndex: number | null,
  receivedAt: number = Date.now()
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const card = state.pendingTileEvent?.card || getCardById(8)!;
  const { isCorrect, timedOut } = answerEvidence(challenge, selectedIndex, receivedAt);

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty, timedOut,
    challenge.hintRequestedAt !== undefined
  );

  const fallbackEffect: CardEffect = { type: 'GAIN_MONEY', amount: isCorrect ? 80 : 20 };
  // A timeout gets the same consolation as a wrong answer. When only a wrong
  // answer was consoled, an instant random guess earned more on average than
  // thinking until time ran out, which also fed guesses into BKT.
  const effect = (isCorrect ? card?.correctReward : card?.wrongOutcome) || card?.effect || fallbackEffect;
  const updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery, timedOut);
  let stateAfterEffect = { ...state, players: updatedPlayers };
  const positionBefore = getCurrentPlayer(stateAfterEffect).position;
  stateAfterEffect = applyCardEffect(stateAfterEffect, effect, getCurrentPlayer(stateAfterEffect));

  // A card reward can move the player. Resolve wherever they ended up, unless
  // the effect was jail, in which case that *is* the outcome.
  const movedPlayer = getCurrentPlayer(stateAfterEffect);
  const wasMoved = movedPlayer.position !== positionBefore && !movedPlayer.isInJail;

  const cardName = card?.name || 'Challenge Card';
  const reward: RewardResult = timedOut
    ? { type: 'NONE', value: 0, description: `Time ran out — ${cardName}: ${describeEffect(effect)}` }
    : isCorrect
    ? { type: 'BONUS_CASH', value: 0, description: `${cardName} — Correct! ${describeEffect(effect)}` }
    : { type: 'NONE', value: 0, description: `${cardName} — ${describeEffect(effect)}` };

  return {
    newState: {
      ...stateAfterEffect,
      turnPhase: wasMoved ? 'RESOLVE_TILE' : 'END_TURN',
      currentChallenge: null,
      pendingTileEvent: null,
    },
    result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player, timedOut),
  };
}

/** Transition from CARD_DRAW to END_TURN (after player sees the card) */
/**
 * Dismiss the drawn card and continue.
 *
 * "Lompat!" (advance 3) and "Undur!" (back 2) move the token, and until Phase 6
 * the turn simply ended there — you could be teleported onto an unowned property
 * and never be offered it, or onto an opponent's and pay nothing. If the card
 * moved you, the tile you actually landed on is resolved now.
 *
 * Jail is the exception: "Polis!" moves you too, but being sent to jail is the
 * whole effect and there is nothing further to resolve.
 */
export function acknowledgeCard(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const drawnAt = state.pendingTileEvent?.tileIndex;
  const wasMoved = drawnAt !== undefined && player.position !== drawnAt && !player.isInJail;

  return {
    ...state,
    turnPhase: wasMoved ? 'RESOLVE_TILE' : 'END_TURN',
    pendingTileEvent: null,
  };
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
      const players = state.players.map((p, i) => {
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
      const players = state.players.map((p, i) => {
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
