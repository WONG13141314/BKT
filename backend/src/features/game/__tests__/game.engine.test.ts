import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  movePlayer,
  resolveTileEvent,
  processAnswer,
  endTurn,
  calculateFinalScores,
  payBail,
} from '../game.engine';
import { GameState, GAME_CONSTANTS } from '../game.types';

describe('Game Engine', () => {
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
      expect(gameState.turnPhase).toBe('ROLL');
      expect(gameState.round).toBe(1);
      expect(gameState.currentPlayerIndex).toBe(0);
    });

    it('should give each player starting money', () => {
      for (const player of gameState.players) {
        expect(player.money).toBe(GAME_CONSTANTS.STARTING_MONEY);
      }
    });

    it('should start all players at position 0 (GO)', () => {
      for (const player of gameState.players) {
        expect(player.position).toBe(0);
      }
    });

    it('should initialize mastery states for all 6 skills', () => {
      const player = gameState.players[0];
      expect(Object.keys(player.masteryStates)).toHaveLength(6);
      for (const mastery of Object.values(player.masteryStates)) {
        expect(mastery).toBe(0.1);
      }
    });

    it('should create property states for all property tiles', () => {
      const propertyCount = gameState.tiles.filter((t) => t.type === 'PROPERTY').length;
      expect(gameState.properties).toHaveLength(propertyCount);
      for (const prop of gameState.properties) {
        expect(prop.ownerId).toBeNull();
        expect(prop.houses).toBe(0);
        expect(prop.hasHotel).toBe(false);
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
    it('should generate a math challenge and transition to MATH_CHALLENGE', () => {
      const newState = startRollPhase(gameState);

      expect(newState.turnPhase).toBe('MATH_CHALLENGE');
      expect(newState.currentChallenge).not.toBeNull();
      expect(newState.currentChallenge?.context).toBe('ROLL_DICE');
    });
  });

  describe('processAnswer', () => {
    it('should update mastery on correct answer', () => {
      const stateWithChallenge = startRollPhase(gameState);
      const correctIdx = stateWithChallenge.currentChallenge!.correctIndex;

      const { result } = processAnswer(stateWithChallenge, correctIdx, 3000);

      expect(result.isCorrect).toBe(true);
      expect(result.newMastery).toBeGreaterThan(result.previousMastery);
      expect(result.streakCount).toBe(1);
      expect(result.reward.type).not.toBe('NONE');
    });

    it('should update mastery on wrong answer', () => {
      const stateWithChallenge = startRollPhase(gameState);
      const correctIdx = stateWithChallenge.currentChallenge!.correctIndex;
      const wrongIdx = (correctIdx + 1) % 4;

      const { result } = processAnswer(stateWithChallenge, wrongIdx, 3000);

      expect(result.isCorrect).toBe(false);
      expect(result.penalty).not.toBeNull();
      expect(result.streakCount).toBe(0);
    });

    it('should increment streak on consecutive correct answers', () => {
      // Set player streak to 2
      gameState.players[0].streak = 2;
      const stateWithChallenge = startRollPhase(gameState);
      const correctIdx = stateWithChallenge.currentChallenge!.correctIndex;

      const { result } = processAnswer(stateWithChallenge, correctIdx, 3000);

      expect(result.streakCount).toBe(3); // 2 + 1
    });

    it('should break streak on wrong answer', () => {
      gameState.players[0].streak = 5;
      const stateWithChallenge = startRollPhase(gameState);
      const correctIdx = stateWithChallenge.currentChallenge!.correctIndex;
      const wrongIdx = (correctIdx + 1) % 4;

      const { result } = processAnswer(stateWithChallenge, wrongIdx, 3000);

      expect(result.streakCount).toBe(0);
      expect(result.streakBroken).toBe(true);
    });
  });

  describe('endTurn', () => {
    it('should advance to the next player', () => {
      gameState.turnPhase = 'ACTION';
      const newState = endTurn(gameState);

      expect(newState.currentPlayerIndex).toBe(1);
      expect(newState.turnPhase).toBe('ROLL');
    });

    it('should wrap around after player 4', () => {
      gameState.currentPlayerIndex = 3;
      gameState.turnPhase = 'ACTION';
      const newState = endTurn(gameState);

      expect(newState.currentPlayerIndex).toBe(0);
      expect(newState.round).toBe(2);
    });

    it('should end the game after maxRounds', () => {
      gameState.currentPlayerIndex = 3;
      gameState.round = 20;
      gameState.turnPhase = 'ACTION';
      const newState = endTurn(gameState);

      expect(newState.phase).toBe('FINISHED');
    });
  });

  describe('payBail', () => {
    it('should release player from jail and deduct bail cost', () => {
      gameState.players[0].isInJail = true;
      gameState.players[0].jailTurns = 1;

      const newState = payBail(gameState);
      const player = getCurrentPlayer(newState);

      expect(player.isInJail).toBe(false);
      expect(player.jailTurns).toBe(0);
      expect(player.money).toBe(GAME_CONSTANTS.STARTING_MONEY - GAME_CONSTANTS.BAIL_COST);
    });
  });

  describe('calculateFinalScores', () => {
    it('should calculate scores for all players', () => {
      const scores = calculateFinalScores(gameState);

      expect(scores).toHaveLength(4);
      expect(scores[0].rank).toBe(1);
      expect(scores[3].rank).toBe(4);
    });

    it('should apply mastery multiplier correctly', () => {
      // Give player 1 high mastery
      gameState.players[0].masteryStates = {
        Addition: 0.9, Subtraction: 0.9, Multiplication: 0.9,
        Division: 0.9, Fractions: 0.9, Decimals: 0.9,
      };

      const scores = calculateFinalScores(gameState);
      const aliceScore = scores.find((s) => s.playerId === 'p1')!;

      // Mastery multiplier = 0.5 + 0.9 = 1.4
      expect(aliceScore.masteryMultiplier).toBeCloseTo(1.4, 1);
      expect(aliceScore.finalScore).toBeGreaterThan(
        scores.find((s) => s.playerId === 'p2')!.finalScore
      );
    });

    it('should include math bonus in final score', () => {
      gameState.players[0].totalCorrect = 20;

      const scores = calculateFinalScores(gameState);
      const aliceScore = scores.find((s) => s.playerId === 'p1')!;

      expect(aliceScore.mathBonus).toBe(200); // 20 × $10
    });
  });
});
