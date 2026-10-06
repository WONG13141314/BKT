// Rule-based opponents. Each delayed action reads live state rather than a
// precomputed turn that can age questions or overwrite a player's response.
import type { GameState, MathChallenge, PlayerState } from './game.types';
import {
  startRollPhase, buyPropertyFullPrice, startSmartBuyChallenge, processSmartBuyAnswer,
  skipBuy, submitDuelAnswer, acknowledgeCard, processCardChallengeAnswer,
  startJailMathEscape, processJailEscapeAnswer, payBail, waitInJail, endTurn, getCurrentPlayer,
} from './game.engine';
import { BAIL_COST } from './game.constants';

const BOT_CORRECT_PROBABILITY: Record<string, number> = { easy: 0.30, medium: 0.50, hard: 0.70 };

function answerAs(player: PlayerState, challenge: MathChallenge): number {
  if (Math.random() < BOT_CORRECT_PROBABILITY[player.botDifficulty ?? 'medium']) return challenge.correctIndex;
  const wrongIndices = challenge.options.map((_, index) => index).filter((index) => index !== challenge.correctIndex);
  return wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
}

/** Bot duellists answer through the same current-question grading path. */
export function submitBotDuelAnswers(state: GameState): GameState {
  const duel = state.duelState;
  if (!duel || duel.resolution) return state;
  let next = state;
  for (const side of [duel.challenger, duel.owner]) {
    if (side.selectedIndex !== null || side.timedOut) continue;
    const player = next.players.find((candidate) => candidate.id === side.playerId);
    if (player?.isBot) next = submitDuelAnswer(next, side.playerId, answerAs(player, side.challenge));
  }
  return next;
}

function botJailDecision(player: PlayerState): 'math' | 'bail' | 'wait' {
  if (Math.random() < 0.7) return 'math';
  return player.money >= BAIL_COST ? 'bail' : 'wait';
}

/** Presentation delays precede exactly one action. Movement waits for viewers. */
export function getBotActionDelay(state: GameState): number | null {
  if (state.phase !== 'PLAYING' || !getCurrentPlayer(state).isBot) return null;
  switch (state.turnPhase) {
    case 'ROLL_PHASE': return 800;
    case 'BUY_DECISION': return 500;
    case 'SMART_BUY_CHALLENGE':
    case 'CARD_MATH_CHALLENGE':
    case 'JAIL_CHALLENGE': return 1_500;
    case 'CARD_DRAW': return 1_500;
    case 'JAIL_DECISION': return 500;
    case 'END_TURN': return state.duelState?.resolution ? 6_000 : 800;
    // Presentation completion and duel settlement have separate handlers.
    case 'MOVING':
    case 'MATH_DUEL':
    case 'RESOLVE_TILE': return null;
  }
}

export interface BotStep { state: GameState; action: string }

/** Compute one action when its delay has elapsed, from the latest state. */
export function executeBotStep(state: GameState): BotStep | null {
  if (getBotActionDelay(state) === null) return null;
  const player = getCurrentPlayer(state);
  switch (state.turnPhase) {
    case 'ROLL_PHASE': return { state: startRollPhase(state), action: 'roll' };
    case 'BUY_DECISION': {
      const event = state.pendingTileEvent;
      if (!event || typeof event.propertyPrice !== 'number') return { state: skipBuy(state), action: 'skip_buy' };
      if (event.propertyPrice > player.money * 0.5) return { state: skipBuy(state), action: 'skip_buy' };
      return event.bankOfferAttempted
        ? { state: buyPropertyFullPrice(state), action: 'buy_full' }
        : { state: startSmartBuyChallenge(state), action: 'smart_buy_start' };
    }
    case 'SMART_BUY_CHALLENGE':
      return state.currentChallenge ? {
        state: processSmartBuyAnswer(state, answerAs(player, state.currentChallenge)).newState,
        action: 'smart_buy_answer',
      } : null;
    case 'CARD_DRAW': return { state: acknowledgeCard(state), action: 'card_ack' };
    case 'CARD_MATH_CHALLENGE':
      return state.currentChallenge ? {
        state: processCardChallengeAnswer(state, answerAs(player, state.currentChallenge)).newState,
        action: 'card_answer',
      } : null;
    case 'JAIL_DECISION': {
      const decision = botJailDecision(player);
      if (decision === 'math') return { state: startJailMathEscape(state), action: 'jail_math_start' };
      if (decision === 'bail') return { state: payBail(state), action: 'jail_bail' };
      return { state: waitInJail(state), action: 'jail_wait' };
    }
    case 'JAIL_CHALLENGE':
      return state.currentChallenge ? {
        state: processJailEscapeAnswer(state, answerAs(player, state.currentChallenge)).newState,
        action: 'jail_answer',
      } : null;
    case 'END_TURN': return { state: endTurn(state), action: 'end_turn' };
    default: return null;
  }
}
