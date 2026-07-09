// Game service — game lifecycle, state management, and BKT integration
// This service bridges the game engine with the database and socket layer

import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  processAnswer,
  resolveTileEvent,
  movePlayer,
  endTurn,
  startBuildHouse,
  payBail,
  calculateFinalScores,
} from './game.engine';
import { GameState, FinalScore } from './game.types';

// In-memory game state store (per active game session)
// In production, this could be backed by Redis for persistence
const activeGames = new Map<string, GameState>();

export const gameService = {
  /**
   * Create a new game session
   */
  createGame: async (
    gameId: string,
    players: { id: string; userId: string; name: string; color: string; order: number }[]
  ): Promise<GameState> => {
    const state = initializeGameState(gameId, players);
    activeGames.set(gameId, state);
    return state;
  },

  /**
   * Get current game state
   */
  getGame: async (gameId: string): Promise<GameState | null> => {
    return activeGames.get(gameId) ?? null;
  },

  /**
   * Synchronous state access (for turn validation in socket handlers)
   */
  getGameSync: (gameId: string): GameState | null => {
    return activeGames.get(gameId) ?? null;
  },

  /**
   * Start the roll phase — generates a math challenge
   */
  startRoll: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'ROLL') return null;

    const newState = startRollPhase(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  /**
   * Process a player's answer to a math challenge
   */
  submitAnswer: (
    gameId: string,
    selectedAnswer: number,
    timeMs: number
  ): { state: GameState; result: ReturnType<typeof processAnswer>['result'] } | null => {
    const state = activeGames.get(gameId);
    if (!state || !state.currentChallenge) return null;

    const { newState, result } = processAnswer(state, selectedAnswer, timeMs);

    // If the challenge was for ROLL_DICE and resolved, move to MOVING phase
    // The game engine handles this in resolvePostAnswer

    activeGames.set(gameId, newState);
    return { state: newState, result };
  },

  /**
   * Execute player movement after dice roll
   */
  executeMove: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MOVING') return null;

    const movedState = movePlayer(state);
    const eventState = resolveTileEvent(movedState);

    activeGames.set(gameId, eventState);
    return eventState;
  },

  /**
   * Build a house on a property
   */
  buildHouse: (gameId: string, tileIndex: number): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'ACTION') return null;

    const newState = startBuildHouse(state, tileIndex);
    if (!newState) return null;

    activeGames.set(gameId, newState);
    return newState;
  },

  /**
   * Pay bail to leave jail
   */
  payBail: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;

    const player = getCurrentPlayer(state);
    if (!player.isInJail) return null;

    const newState = payBail(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  /**
   * End the current player's turn
   */
  endTurn: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'ACTION') return null;

    const newState = endTurn(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  /**
   * Calculate final scores when game ends
   */
  getScores: (gameId: string): FinalScore[] | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;

    return calculateFinalScores(state);
  },

  /**
   * Clean up a finished game
   */
  removeGame: (gameId: string): void => {
    activeGames.delete(gameId);
  },
};
