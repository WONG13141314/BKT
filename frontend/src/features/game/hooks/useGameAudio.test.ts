import { describe, expect, it } from 'vitest';
import type { GameState } from '../types/game.types';
import { gameStateSounds } from './useGameAudio';

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-1',
    diceRollId: 1,
    currentPlayerIndex: 0,
    turnPhase: 'ROLL_PHASE',
    properties: [{ tileIndex: 1, ownerId: null, isLeveledUp: false }],
    players: [{
      id: 'seat-1',
      playerId: 'player-1',
      name: 'Player',
      position: 0,
      money: 800,
      color: '#d00',
      tokenType: 'top_hat',
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
      isBot: false,
    }],
    ...overrides,
  } as GameState;
}

describe('gameStateSounds', () => {
  it('announces a new dice roll and turn from committed state', () => {
    const previous = state();
    const current = state({ diceRollId: 2, currentPlayerIndex: 1 });

    expect(gameStateSounds(previous, current)).toEqual(['diceRoll', 'turn']);
  });

  it('uses the specific deed sound instead of an extra generic cash sound', () => {
    const previous = state();
    const current = state({
      properties: [{ tileIndex: 1, ownerId: 'seat-1', isLeveledUp: false }],
      players: [{ ...previous.players[0], money: 650 }],
    });

    expect(gameStateSounds(previous, current)).toEqual(['property']);
  });

  it('maps the improved branch challenge and jail phases', () => {
    expect(gameStateSounds(state(), state({ turnPhase: 'CARD_MATH_CHALLENGE' })))
      .toEqual(['challenge']);
    expect(gameStateSounds(state(), state({ turnPhase: 'JAIL_DECISION' })))
      .toEqual(['jail']);
  });
});
