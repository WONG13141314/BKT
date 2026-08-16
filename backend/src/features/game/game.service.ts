// ============================================
// Game Service — MathOpoly Redesign
// Bridges game engine with socket layer
// Manages active game sessions in memory
// ============================================

import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  processRollChallengeAnswer,
  movePlayer,
  resolveTileEvent,
  buyPropertyFullPrice,
  buildHouse,
  startSmartBuyChallenge,
  processSmartBuyAnswer,
  skipBuy,
  placeAuctionBid,
  resolveAuction,
  submitDuelAnswer,
  bothDuellistsAnswered,
  expireDuelSides,
  resolveDuel,
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
import type { GamePlayerSeed } from './game.engine';
import {
  GameState,
  FinalScore,
  MasteryReport,
  AnswerResult,
  TurnPhase,
  DuelState,
  DuelResolution,
} from './game.types';
import { executeBotTurn, submitBotDuelAnswers, BotTurnStep } from './bot.engine';
import { awaitPlayerWrites, loadMasteryPriors, newGameId, recordAttempt } from './game.persistence';

// In-memory game state store (per active game session)
const activeGames = new Map<string, GameState>();

/** Backward-compatible state boundary for sessions persisted before Task 2. */
function normalizeRestoredState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      recentQuestionFingerprints: Array.isArray(player.recentQuestionFingerprints)
        ? player.recentQuestionFingerprints.slice(-8)
        : [],
    })),
  };
}

/**
 * Every answer submission has the same shape: check the phase, grade it, store
 * the new state, log the attempt. Routing all six through here means the
 * research log cannot drift out of sync with gameplay — including timeouts,
 * which reach the engine via `resolveStalledTurn` rather than a socket event.
 */
function submitAnswer(
  gameId: string,
  requiredPhase: TurnPhase,
  process: (
    state: GameState,
    selectedIndex: number | null,
    receivedAt?: number
  ) => { newState: GameState; result: AnswerResult },
  selectedIndex: number | null,
  receivedAt: number = Date.now()
): { state: GameState; result: AnswerResult } | null {
  const state = activeGames.get(gameId);
  if (!state || state.turnPhase !== requiredPhase || !state.currentChallenge) return null;

  // Captured before grading — the engine clears the challenge as it resolves.
  const challenge = state.currentChallenge;
  const player = state.players[state.currentPlayerIndex];

  const { newState, result } = process(state, selectedIndex, receivedAt);
  activeGames.set(gameId, newState);

  // Fire-and-forget: gameplay never waits on the database.
  recordAttempt({
    player,
    dbGameId: state.dbGameId,
    challenge,
    selectedIndex,
    timeMs: Math.max(0, receivedAt - challenge.startedAt),
    previousMastery: result.previousMastery,
    newMastery: result.newMastery,
    isCorrect: result.isCorrect,
  });

  return { state: newState, result };
}

/**
 * Log both sides of a settled duel.
 *
 * This is the only place a player produces evidence on someone else's turn. A
 * landlord who is landed on three times contributes three extra observations
 * without waiting for their own turn to come round, which is a large part of
 * why the duel exists at all.
 *
 * `state` must be the post-resolution state — `applyAnswerToPlayer` has already
 * incremented the counters, and the before/after masteries live on each side.
 */
function recordDuelAttempts(duel: DuelState, state: GameState): void {
  for (const side of [duel.challenger, duel.owner]) {
    const player = state.players.find((p) => p.id === side.playerId);
    if (!player || side.previousMastery === null || side.newMastery === null) continue;

    recordAttempt({
      player,
      dbGameId: state.dbGameId,
      challenge: side.challenge,
      // A side that never answered is logged as explicit no-answer evidence.
      selectedIndex: side.selectedIndex,
      timeMs: side.timeMs ?? 0,
      previousMastery: side.previousMastery,
      newMastery: side.newMastery,
      isCorrect: side.isCorrect === true,
    });
  }
}

export const gameService = {
  // ---- Lifecycle ----

  createGame: async (gameId: string, players: GamePlayerSeed[]): Promise<GameState> => {
    // Resume each returning player's BKT chain. Bots have no Player row.
    const humanIds = players.filter((p) => !p.isBot).map((p) => p.playerId);
    await Promise.all(humanIds.map(awaitPlayerWrites));
    const priors = await loadMasteryPriors(humanIds);

    const seeded = players.map((p) => {
      const prior = p.isBot ? undefined : priors.get(p.playerId);
      return { ...p, masteryPriors: prior?.mastery, attemptPriors: prior?.attempts };
    });

    const state = initializeGameState(gameId, seeded, newGameId());
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

  /**
   * Overwrite a session's state wholesale. Used to rehydrate a game after a
   * server restart, and by tests to set up a specific phase directly.
   */
  replaceState: (gameId: string, state: GameState): GameState => {
    const normalized = normalizeRestoredState(state);
    activeGames.set(gameId, normalized);
    return normalized;
  },

  // ---- Roll Phase ----

  startRoll: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'ROLL_PHASE') return null;

    const newState = startRollPhase(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Roll Challenge ----

  submitRollChallengeAnswer: (
    gameId: string,
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; result: AnswerResult } | null =>
    submitAnswer(gameId, 'ROLL_CHALLENGE', processRollChallengeAnswer, selectedIndex, receivedAt),

  // ---- Movement ----

  executeMove: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MOVING') return null;

    const movedState = movePlayer(state);
    const resolvedState = resolveTileEvent(movedState);
    activeGames.set(gameId, resolvedState);
    return resolvedState;
  },

  /**
   * Resolve the tile the player is already standing on, without moving them.
   *
   * Needed because a challenge card can teleport a player ("Lompat!", "Undur!").
   * `executeMove` would roll them forward again by the dice, which is not what a
   * card move means.
   */
  resolveTile: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'RESOLVE_TILE') return null;

    const resolved = resolveTileEvent(state);
    activeGames.set(gameId, resolved);
    return resolved;
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
    if (newState === state) return null;
    activeGames.set(gameId, newState);
    return newState;
  },

  submitSmartBuyAnswer: (
    gameId: string,
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; result: AnswerResult } | null =>
    submitAnswer(gameId, 'SMART_BUY_CHALLENGE', processSmartBuyAnswer, selectedIndex, receivedAt),

  skipBuy: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'BUY_DECISION') return null;

    const newState = skipBuy(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  placeAuctionBid: (gameId: string, playerId: string, amount: number): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'AUCTION') return null;
    const newState = placeAuctionBid(state, playerId, amount);
    if (newState === state) return null;
    activeGames.set(gameId, newState);
    return newState;
  },

  resolveAuction: (gameId: string): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'AUCTION') return null;
    const newState = resolveAuction(state);
    activeGames.set(gameId, newState);
    return newState;
  },

  buildHouse: (gameId: string, tileIndex: number): GameState | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'END_TURN') return null;

    const newState = buildHouse(state, tileIndex);
    if (newState === state) return null;
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Math Duel ----

  /**
   * Record one duellist's answer, then settle if both sides are in.
   *
   * Returns `resolution` only on the submission that completes the duel, so the
   * socket layer can broadcast the reveal exactly once.
   */
  submitDuelAnswer: (
    gameId: string,
    playerId: string,
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; resolution: DuelResolution | null } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MATH_DUEL' || !state.duelState) return null;

    // A bot landlord answers the moment the challenge reaches it.
    let next = submitBotDuelAnswers(submitDuelAnswer(state, playerId, selectedIndex, receivedAt));

    if (!bothDuellistsAnswered(next)) {
      activeGames.set(gameId, next);
      return { state: next, resolution: null };
    }

    const settled = resolveDuel(next);
    activeGames.set(gameId, settled.newState);
    recordDuelAttempts(settled.duel, settled.newState);

    return { state: settled.newState, resolution: settled.resolution };
  },

  /**
   * Submit any duel side belonging to a bot, then settle if that completes it.
   * Returns null when there is no open duel or no bot left to answer.
   */
  submitBotDuelAnswers: (
    gameId: string
  ): { state: GameState; resolution: DuelResolution | null } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MATH_DUEL' || !state.duelState) return null;
    if (state.duelState.resolution) return null;

    const next = submitBotDuelAnswers(state);
    if (next === state) return null; // No bot was waiting.

    if (!bothDuellistsAnswered(next)) {
      activeGames.set(gameId, next);
      return { state: next, resolution: null };
    }

    const settled = resolveDuel(next);
    activeGames.set(gameId, settled.newState);
    recordDuelAttempts(settled.duel, settled.newState);

    return { state: settled.newState, resolution: settled.resolution };
  },

  /** Close elapsed duel sides and settle once both answers are final. */
  forceResolveDuel: (
    gameId: string
  ): { state: GameState; resolution: DuelResolution | null } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.turnPhase !== 'MATH_DUEL' || !state.duelState) return null;

    const expired = expireDuelSides(state);
    if (!bothDuellistsAnswered(expired)) {
      activeGames.set(gameId, expired);
      return { state: expired, resolution: null };
    }

    const settled = resolveDuel(expired);
    activeGames.set(gameId, settled.newState);
    recordDuelAttempts(settled.duel, settled.newState);

    return { state: settled.newState, resolution: settled.resolution };
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
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; result: AnswerResult } | null =>
    submitAnswer(gameId, 'CARD_MATH_CHALLENGE', processCardChallengeAnswer, selectedIndex, receivedAt),

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
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; result: AnswerResult } | null =>
    submitAnswer(gameId, 'JAIL_CHALLENGE', processJailEscapeAnswer, selectedIndex, receivedAt),

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
    selectedIndex: number | null,
    receivedAt?: number
  ): { state: GameState; result: AnswerResult } | null =>
    submitAnswer(gameId, 'LEVEL_UP_CHALLENGE', processLevelUpAnswer, selectedIndex, receivedAt),

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

    // Pass through the _skipLevelUpCheck flag from the state (set by processLevelUpAnswer / declineLevelUp)
    const skipLevelUp = (state as any)._skipLevelUpCheck === true;
    const newState = endTurn(state, skipLevelUp);
    activeGames.set(gameId, newState);
    return newState;
  },

  // ---- Bot Turn ----

  planBotTurn: (gameId: string): BotTurnStep[] | null => {
    const state = activeGames.get(gameId);
    if (!state) return null;

    const player = getCurrentPlayer(state);
    if (!player.isBot) return null;

    return executeBotTurn(state);
  },

  /** Commits exactly one bot presentation step after its delay has elapsed. */
  commitBotStep: (gameId: string, state: GameState): GameState => {
    activeGames.set(gameId, state);
    return state;
  },

  // ---- Stall recovery ----

  /**
   * Force the current phase forward when the active player has run out of time
   * or vanished. Challenges submit an invalid index (never the correct one);
   * decisions take the option that costs the player least.
   *
   * Without this a single unanswered question or closed browser tab wedges the
   * room permanently — every other player is left waiting on a turn that will
   * never end.
   */
  resolveStalledTurn: (
    gameId: string
  ): { state: GameState; result: AnswerResult | null } | null => {
    const state = activeGames.get(gameId);
    if (!state || state.phase !== 'PLAYING') return null;

    const advanced = (next: GameState | null) =>
      next ? { state: next, result: null } : null;

    // Null is explicit no-answer evidence, distinct from an incorrect choice.
    const NO_ANSWER = null;

    switch (state.turnPhase) {
      case 'ROLL_PHASE':
        return advanced(gameService.startRoll(gameId));
      case 'MOVING':
        return advanced(gameService.executeMove(gameId));
      case 'ROLL_CHALLENGE':
        return gameService.submitRollChallengeAnswer(gameId, NO_ANSWER);
      case 'SMART_BUY_CHALLENGE':
        return gameService.submitSmartBuyAnswer(gameId, NO_ANSWER);
      case 'CARD_MATH_CHALLENGE':
        return gameService.submitCardAnswer(gameId, NO_ANSWER);
      case 'JAIL_CHALLENGE':
        return gameService.submitJailAnswer(gameId, NO_ANSWER);
      case 'LEVEL_UP_CHALLENGE':
        return gameService.submitLevelUpAnswer(gameId, NO_ANSWER);
      case 'BUY_DECISION':
        return advanced(gameService.skipBuy(gameId));
      case 'AUCTION':
        return advanced(gameService.resolveAuction(gameId));
      case 'MATH_DUEL':
        return advanced(gameService.forceResolveDuel(gameId)?.state ?? null);
      case 'JAIL_DECISION':
        return advanced(gameService.waitInJail(gameId));
      case 'LEVEL_UP_OFFER':
        return advanced(gameService.declineLevelUp(gameId));
      case 'CARD_DRAW':
        return advanced(gameService.acknowledgeCard(gameId));
      case 'END_TURN':
        return advanced(gameService.endTurn(gameId));
      default:
        // RESOLVE_TILE is advanced by the server in the same transition loop.
        return null;
    }
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

  /** Returns only the authenticated human player's private learning report. */
  getMasteryReportForPlayer: (gameId: string, dbPlayerId: string): MasteryReport | null => {
    const state = activeGames.get(gameId);
    const player = state?.players.find((candidate) =>
      candidate.playerId === dbPlayerId && !candidate.isBot
    );
    return player ? generateMasteryReport(player) : null;
  },
};
