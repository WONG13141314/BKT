// ============================================
// Game Service — MathOpoly Redesign
// Bridges game engine with socket layer
// Manages active game sessions in memory
// ============================================

import {
  initializeGameState,
  getCurrentPlayer,
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
  calculateFinalScores,
  generateMasteryReport,
} from './game.engine';
import { GameState, FinalScore, MasteryReport, AnswerResult } from './game.types';
import { executeBotTurn, BotTurnStep } from './bot.engine';

// In-memory game state store (per active game session)
const activeGames = new Map<string, GameState>();

export const gameService = {
  // ---- Lifecycle ----

  createGame: async (
    gameId: string,
    players: { id: string; userId: string; name: string; color: string; order: number; isBot?: boolean; botDifficulty?: 'easy' | 'medium' | 'hard' }[]
  ): Promise<GameState> => {
    const state = initializeGameState(gameId, players);
    activeGames.set(gameId, state);
    return state;
  },

  getGame: async (gameId: string): Promise<GameState | null> => {
    return activeGames.get(gameId) ?? null;
  },

  getGameSync: (gameId: string): GameState | null => {
    return activeGames.get(gameId) ?? null;
  },

  removeGame: (gameId: string): void => {
    activeGames.delete(gameId);
  },

  // ---- Roll Phase ----

  startRoll: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'ROLL_PHASE') return null;

    const newState = startRollPhase(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Dice Challenge ----

  submitDiceChallengeAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'DICE_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processDiceChallengeAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  // ---- Movement ----

  executeMove: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MOVING') return null;

    const movedState = movePlayer(state);
    const resolvedState = resolveTileEvent(movedState);
    activeGames.set(gameId, resolvedState);
    return resolvedState;
  },

  // ---- Buy Property ----

  buyFull: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'BUY_DECISION') return null;

    const newState = buyPropertyFullPrice(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  startSmartBuy: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'BUY_DECISION') return null;

    const newState = startSmartBuyChallenge(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  submitSmartBuyAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'SMART_BUY_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processSmartBuyAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  skipBuy: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'BUY_DECISION') return null;

    const newState = skipBuy(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Rent ----

  payRent: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'RENT_PAYMENT') return null;

    const newState = payFullRent(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  startRentDefense: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'RENT_PAYMENT') return null;

    const newState = startRentDefense(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  submitRentDefenseAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'RENT_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processRentDefenseAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  // ---- Challenge Cards ----

  acknowledgeCard: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'CARD_DRAW') return null;

    const newState = acknowledgeCard(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  submitCardAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'CARD_MATH_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processCardChallengeAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  // ---- Jail ----

  jailMathEscape: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'JAIL_DECISION') return null;

    const newState = startJailMathEscape(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  submitJailAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'JAIL_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processJailEscapeAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  payBail: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'JAIL_DECISION') return null;

    const newState = payBail(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  waitInJail: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'JAIL_DECISION') return null;

    const newState = waitInJail(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Level Up ----

  startLevelUp: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'LEVEL_UP_OFFER') return null;

    const newState = startLevelUpChallenge(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  submitLevelUpAnswer: (
    gameId: string,
    selectedIndex: number,
    timeMs: number
  ): { state: GameState; result: AnswerResult } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'LEVEL_UP_CHALLENGE' || !state.currentChallenge) return null;

    const { newState, result } = processLevelUpAnswer(state, selectedIndex, timeMs);
    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  declineLevelUp: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'LEVEL_UP_OFFER') return null;

    const newState = declineLevelUp(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- End Turn ----

  endTurn: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'END_TURN') return null;

    const newState = endTurn(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Bot Turn ----

  executeBotTurn: (gameId: string): BotTurnStep[] | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;

    const player = getCurrentPlayer(state);
    if (!player.isBot) return null;

    const steps = executeBotTurn(state);
    // Save the final state
    if (steps.length > 0) {
      activeGames.set(gameId, steps[steps.length - 1].state);
    }
    return steps;
  },

  // ---- Scoring ----

  getScores: (gameId: string): FinalScore[] | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;
    return calculateFinalScores(state);
  },

  getMasteryReports: (gameId: string): MasteryReport[] | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;
    // Only generate reports for human players
    return state.players
      .filter((p) => !p.isBot)
      .map((p) => generateMasteryReport(p));
  },
};
