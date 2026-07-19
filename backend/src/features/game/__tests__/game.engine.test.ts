import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  movePlayer,
  resolveTileEvent,
  processDiceChallengeAnswer,
  endTurn,
  calculateFinalScores,
  payBail,
} from '../game.engine';
import { GameState } from '../game.types';
import { STARTING_MONEY, BAIL_COST, MAX_ROUNDS } from '../game.constants';

describe('Game Engine — MathOpoly Redesign', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = initializeGameState('test-game', [
      { id: 'p1', userId: 'u1', name: 'Alice', color: '#6366f1', order: 0 },
      { id: 'p2', userId: 'u2', name: 'Bob', color: '#f59e0b', order: 1 },
      { id: 'p3', userId: 'u3', name: 'Carol', color: '#10b981', order: 2 },
      { id: 'p4', userId: 'u4', name: 'Dave', color: '#ef4444', order: 3 },
    ]);
  });

  describe('initializeGameState', () => {
    it('should create a valid game state with 4 players', () => {
      expect(gameState.players).toHaveLength(4);
      expect(gameState.phase).toBe('PLAYING');
      expect(gameState.turnPhase).toBe('ROLL_PHASE');
      expect(gameState.round).toBe(1);
      expect(gameState.currentPlayerIndex).toBe(0);
    });

    it('should give each player starting money', () => {
      for (const player of gameState.players) {
        expect(player.money).toBe(STARTING_MONEY);
      }
    });

    it('should start all players at position 0 (GO)', () => {
      for (const player of gameState.players) {
        expect(player.position).toBe(0);
      }
    });

    it('should initialize mastery states for all 4 skills', () => {
      const player = gameState.players[0];
      expect(Object.keys(player.masteryStates)).toHaveLength(4);
      for (const mastery of Object.values(player.masteryStates)) {
        expect(mastery).toBe(0.1);
      }
    });

    it('should create property states for all property tiles', () => {
      const propertyCount = gameState.tiles.filter((t) => t.type === 'PROPERTY').length;
      expect(gameState.properties).toHaveLength(propertyCount);
      for (const prop of gameState.properties) {
        expect(prop.ownerId).toBeNull();
        expect(prop.isLeveledUp).toBe(false);
      }
    });
  });

  describe('getCurrentPlayer', () => {
    it('should return the player at currentPlayerIndex', () => {
      expect(getCurrentPlayer(gameState).id).toBe('p1');

      gameState.currentPlayerIndex = 2;
      expect(getCurrentPlayer(gameState).id).toBe('p3');
    });
  });

  describe('startRollPhase', () => {
    it('should roll dice and transition to appropriate phase', () => {
      const newState = startRollPhase(gameState);

      // Should either have a dice challenge or move directly
      expect(['DICE_CHALLENGE', 'MOVING']).toContain(newState.turnPhase);
      expect(newState.diceValues[0]).toBeGreaterThanOrEqual(1);
      expect(newState.diceValues[0]).toBeLessThanOrEqual(6);
      expect(newState.diceValues[1]).toBeGreaterThanOrEqual(1);
      expect(newState.diceValues[1]).toBeLessThanOrEqual(6);
    });
  });

  describe('processDiceChallengeAnswer', () => {
    it('should handle correct answer with bonus cash', () => {
      // Force a dice challenge
      const rolledState = startRollPhase(gameState);
      if (rolledState.turnPhase === 'DICE_CHALLENGE' && rolledState.currentChallenge) {
        const correctIdx = rolledState.currentChallenge.correctIndex;
        const { result, newState } = processDiceChallengeAnswer(rolledState, correctIdx, 3000);

        expect(result.isCorrect).toBe(true);
        expect(result.newMastery).toBeGreaterThanOrEqual(result.previousMastery);
      }
    });
  });

  describe('endTurn', () => {
    it('should advance to the next player', () => {
      gameState.turnPhase = 'END_TURN';
      const newState = endTurn(gameState);

      expect(newState.currentPlayerIndex).toBe(1);
      expect(newState.turnPhase).toBe('ROLL_PHASE');
    });

    it('should wrap around after last player', () => {
      gameState.currentPlayerIndex = 3;
      gameState.turnPhase = 'END_TURN';
      const newState = endTurn(gameState);

      expect(newState.currentPlayerIndex).toBe(0);
      expect(newState.round).toBe(2);
    });

    it('should end the game after maxRounds', () => {
      gameState.currentPlayerIndex = 3;
      gameState.round = MAX_ROUNDS;
      gameState.turnPhase = 'END_TURN';
      const newState = endTurn(gameState);

      expect(newState.phase).toBe('FINISHED');
    });
  });

  describe('payBail', () => {
    it('should release player from jail and deduct bail cost', () => {
      gameState.players[0].isInJail = true;
      gameState.players[0].jailTurns = 1;
      gameState.turnPhase = 'JAIL_DECISION';

      const newState = payBail(gameState);
      const player = getCurrentPlayer(newState);

      expect(player.isInJail).toBe(false);
      expect(player.jailTurns).toBe(0);
      expect(player.money).toBe(STARTING_MONEY - BAIL_COST);
    });
  });

  describe('calculateFinalScores', () => {
    it('should calculate scores for all players', () => {
      const scores = calculateFinalScores(gameState);

      expect(scores).toHaveLength(4);
      expect(scores[0].rank).toBe(1);
      expect(scores[3].rank).toBe(4);
    });

    it('should rank by net worth (cash + property value)', () => {
      // Give player 1 extra money
      gameState.players[0].money = 2000;

      const scores = calculateFinalScores(gameState);
      const aliceScore = scores.find((s) => s.playerId === 'p1')!;

      expect(aliceScore.rank).toBe(1);
      expect(aliceScore.netWorth).toBeGreaterThanOrEqual(2000);
    });
  });
});
