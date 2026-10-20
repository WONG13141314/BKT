// Creating a new match: seats, starting money, board and card deck.

import { randomUUID } from 'crypto';
import { GameState, PlayerState } from '../game.types';
import { PLAYER_TOKENS, type PlayerToken } from '../game.tokens';
import { SKILL_NAMES, STARTING_MONEY, MAX_ROUNDS } from '../game.constants';
import { BOARD_TILES, initializeProperties } from '../board.config';
import { createShuffledDeck } from '../card.deck';
import { INITIAL_MASTERY } from '../../../bkt/bkt.defaults';

export interface GamePlayerSeed {
  id: string;
  playerId: string;
  name: string;
  color: string;
  tokenType?: PlayerToken;
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
    tokenType: p.tokenType ?? PLAYER_TOKENS[p.order % PLAYER_TOKENS.length],
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
    recentQuestionFingerprints: [],
    recentIssuedSkills: [],
    lastQuestionDifficulty: {},
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
    diceRollId: 0,
    diceCount: 2,
    currentChallenge: null,
    duelState: null,
    pendingTileEvent: null,
    challengeCardDeck: createShuffledDeck(),
    challengeCardIndex: 0,
    gameStartTime: Date.now(),
    isFinalRound: false,
  };
}
