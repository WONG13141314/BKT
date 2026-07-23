// ============================================
// Bot Engine — AI Decision Logic
// Rule-based bots for solo/small-group play
// No BKT tracking needed — simple probability-of-correct
// ============================================

import { GameState, PlayerState } from './game.types';
import {
  startRollPhase,
  processDiceChallengeAnswer,
  movePlayer,
  resolveTileEvent,
  buyPropertyFullPrice,
  startSmartBuyChallenge,
  processSmartBuyAnswer,
  skipBuy,
  payFullRent,
  startRentDefense,
  processRentDefenseAnswer,
  acknowledgeCard,
  processCardChallengeAnswer,
  startJailMathEscape,
  processJailEscapeAnswer,
  payBail,
  waitInJail,
  startLevelUpChallenge,
  processLevelUpAnswer,
  declineLevelUp,
  endTurn,
  getCurrentPlayer,
} from './game.engine';
import { BAIL_COST } from './game.constants';

// ---- Bot Difficulty Settings ----

const BOT_CORRECT_PROBABILITY: Record<string, number> = {
  easy: 0.30,
  medium: 0.50,
  hard: 0.70,
};

// ---- Bot Decision Functions ----

/** Simulate a bot answering a question — returns a selected index */
function botAnswer(state: GameState): number {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge;
  if (!challenge) return 0;

  const probability = BOT_CORRECT_PROBABILITY[player.botDifficulty ?? 'medium'];

  if (Math.random() < probability) {
    // Bot answers correctly
    return challenge.correctIndex;
  } else {
    // Bot picks a wrong answer
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== challenge.correctIndex);
    return wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
  }
}

/** Should bot attempt Smart Buy? Always yes — they always try for the discount */
function shouldSmartBuy(): boolean {
  return true;
}

/** Should bot attempt Rent Defense? Yes if rent is significant */
function shouldDefendRent(rentAmount: number): boolean {
  return rentAmount > 30;
}

/** Should bot buy property at full price? */
function shouldBuyProperty(player: PlayerState, price: number): boolean {
  // Buy if price ≤ 50% of cash (keep a reserve)
  return price <= player.money * 0.5;
}

/** Should bot attempt Level Up? */
function shouldLevelUp(player: PlayerState, cost: number): boolean {
  // Level up if cost ≤ 30% of cash, or has a free token
  return player.hasLevelUpToken || cost <= player.money * 0.3;
}

/** How should bot escape jail? */
function botJailDecision(player: PlayerState): 'math' | 'bail' | 'wait' {
  // Try math first
  if (Math.random() < 0.7) return 'math';
  // Pay bail if affordable
  if (player.money >= BAIL_COST) return 'bail';
  // Wait
  return 'wait';
}

// ============================================
// BOT TURN EXECUTOR
// Runs a complete bot turn, returning state transitions
// ============================================

export interface BotTurnStep {
  state: GameState;
  action: string;
  delay: number; // ms to wait before this step (for animation purposes)
}

/**
 * Execute a full bot turn and return all intermediate states.
 * The caller (socket handler) should emit each state with delays.
 */
export function executeBotTurn(state: GameState): BotTurnStep[] {
  const steps: BotTurnStep[] = [];
  let currentState = state;
  let safety = 0;
  const MAX_ITERATIONS = 20;

  while (currentState.phase === 'PLAYING' && safety < MAX_ITERATIONS) {
    safety++;
    const player = getCurrentPlayer(currentState);

    // Only process if it's still this bot's turn
    if (!player.isBot) break;

    switch (currentState.turnPhase) {
      case 'ROLL_PHASE': {
        currentState = startRollPhase(currentState);
        steps.push({ state: currentState, action: 'roll', delay: 800 });
        break;
      }

      case 'DICE_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processDiceChallengeAnswer(currentState, answer, 3000);
        currentState = newState;
        steps.push({ state: currentState, action: 'dice_answer', delay: 1500 });
        break;
      }

      case 'MOVING': {
        currentState = movePlayer(currentState);
        steps.push({ state: currentState, action: 'move', delay: 1000 });
        // Auto-resolve tile
        currentState = resolveTileEvent(currentState);
        steps.push({ state: currentState, action: 'resolve', delay: 500 });
        break;
      }

      case 'BUY_DECISION': {
        const event = currentState.pendingTileEvent!;
        const price = event.propertyPrice!;

        if (shouldBuyProperty(player, price)) {
          if (shouldSmartBuy()) {
            currentState = startSmartBuyChallenge(currentState);
            steps.push({ state: currentState, action: 'smart_buy_start', delay: 500 });
          } else {
            currentState = buyPropertyFullPrice(currentState);
            steps.push({ state: currentState, action: 'buy_full', delay: 500 });
          }
        } else {
          currentState = skipBuy(currentState);
          steps.push({ state: currentState, action: 'skip_buy', delay: 300 });
        }
        break;
      }

      case 'SMART_BUY_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processSmartBuyAnswer(currentState, answer, 4000);
        currentState = newState;
        steps.push({ state: currentState, action: 'smart_buy_answer', delay: 1500 });
        break;
      }

      case 'RENT_PAYMENT': {
        const event = currentState.pendingTileEvent!;
        const rent = event.rentAmount!;

        if (shouldDefendRent(rent)) {
          currentState = startRentDefense(currentState);
          steps.push({ state: currentState, action: 'rent_defense_start', delay: 500 });
        } else {
          currentState = payFullRent(currentState);
          steps.push({ state: currentState, action: 'pay_rent', delay: 500 });
        }
        break;
      }

      case 'RENT_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processRentDefenseAnswer(currentState, answer, 4000);
        currentState = newState;
        steps.push({ state: currentState, action: 'rent_defense_answer', delay: 1500 });
        break;
      }

      case 'CARD_DRAW': {
        currentState = acknowledgeCard(currentState);
        steps.push({ state: currentState, action: 'card_ack', delay: 1500 });
        break;
      }

      case 'CARD_MATH_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processCardChallengeAnswer(currentState, answer, 4000);
        currentState = newState;
        steps.push({ state: currentState, action: 'card_answer', delay: 1500 });
        break;
      }

      case 'JAIL_DECISION': {
        const decision = botJailDecision(player);
        switch (decision) {
          case 'math':
            currentState = startJailMathEscape(currentState);
            steps.push({ state: currentState, action: 'jail_math_start', delay: 500 });
            break;
          case 'bail':
            currentState = payBail(currentState);
            steps.push({ state: currentState, action: 'jail_bail', delay: 500 });
            break;
          case 'wait':
            currentState = waitInJail(currentState);
            steps.push({ state: currentState, action: 'jail_wait', delay: 500 });
            break;
        }
        break;
      }

      case 'JAIL_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processJailEscapeAnswer(currentState, answer, 4000);
        currentState = newState;
        steps.push({ state: currentState, action: 'jail_answer', delay: 1500 });
        break;
      }

      case 'LEVEL_UP_OFFER': {
        const event = currentState.pendingTileEvent!;
        const cost = event.propertyPrice!;

        if (shouldLevelUp(player, cost)) {
          currentState = startLevelUpChallenge(currentState);
          steps.push({ state: currentState, action: 'level_up_start', delay: 500 });
        } else {
          currentState = declineLevelUp(currentState);
          steps.push({ state: currentState, action: 'level_up_decline', delay: 300 });
        }
        break;
      }

      case 'LEVEL_UP_CHALLENGE': {
        const answer = botAnswer(currentState);
        const { newState } = processLevelUpAnswer(currentState, answer, 5000);
        currentState = newState;
        steps.push({ state: currentState, action: 'level_up_answer', delay: 1500 });
        break;
      }

      case 'END_TURN': {
        // Pass through _skipLevelUpCheck if set (after Level Up answer/decline)
        const skipLevelUp = (currentState as any)._skipLevelUpCheck === true;
        currentState = endTurn(currentState, skipLevelUp);
        steps.push({ state: currentState, action: 'end_turn', delay: 300 });
        // Break out — next player's turn
        return steps;
      }

      case 'RESOLVE_TILE': {
        currentState = resolveTileEvent(currentState);
        steps.push({ state: currentState, action: 'resolve', delay: 500 });
        break;
      }

      default: {
        // Unknown phase — force end turn to prevent infinite loop
        currentState = endTurn(currentState);
        steps.push({ state: currentState, action: 'force_end', delay: 300 });
        return steps;
      }
    }
  }

  return steps;
}
