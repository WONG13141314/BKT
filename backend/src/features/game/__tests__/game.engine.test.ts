import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  movePlayer,
  resolveTileEvent,
  processRollChallengeAnswer,
  endTurn,
  calculateFinalScores,
  payBail,
  skipBuy,
  placeAuctionBid,
  resolveAuction,
  buildHouse,
  startSmartBuyChallenge,
  processSmartBuyAnswer,
} from '../game.engine';
import { GameState } from '../game.types';
import { STARTING_MONEY, BAIL_COST, MAX_ROUNDS } from '../game.constants';
import { selectChallenge } from '../../../bkt/bkt.selector';

describe('Game Engine — MathOpoly Redesign', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = initializeGameState('test-game', [
      { id: 'p1', playerId: 'u1', name: 'Alice', color: '#6366f1', order: 0 },
      { id: 'p2', playerId: 'u2', name: 'Bob', color: '#f59e0b', order: 1 },
      { id: 'p3', playerId: 'u3', name: 'Carol', color: '#10b981', order: 2 },
      { id: 'p4', playerId: 'u4', name: 'Dave', color: '#ef4444', order: 3 },
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

    it('starts each learner with an empty private recent-question window', () => {
      expect(gameState.players.map((player) => player.recentQuestionFingerprints)).toEqual([[], [], [], []]);
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

      // Normal turns now roll directly; questions belong to board events.
      expect(newState.turnPhase).toBe('MOVING');
      expect(newState.currentChallenge).toBeNull();
      expect(newState.diceCount).toBe(2);
      expect(newState.diceValues.every((value) => value >= 1 && value <= 6)).toBe(true);
    });
  });

  describe('processRollChallengeAnswer', () => {
    it('awards two dice and a bonus for a correct answer', () => {
      const opened = openLegacyRollChallenge(gameState);
      const correctIdx = opened.currentChallenge!.correctIndex;
      const { result, newState } = processRollChallengeAnswer(opened, correctIdx, 3000);

      expect(result.isCorrect).toBe(true);
      expect(result.newMastery).toBeGreaterThanOrEqual(result.previousMastery);
      expect(newState.diceCount).toBe(2);
      expect(newState.diceValues[1]).toBeGreaterThanOrEqual(1);
      expect(newState.turnPhase).toBe('MOVING');
    });

    it('still moves the player on a wrong answer, but with one die', () => {
      const opened = openLegacyRollChallenge(gameState);
      const wrongIdx = (opened.currentChallenge!.correctIndex + 1) % 4;
      const { result, newState } = processRollChallengeAnswer(opened, wrongIdx, 3000);

      expect(result.isCorrect).toBe(false);
      expect(newState.diceCount).toBe(1);
      expect(newState.diceValues[0]).toBeGreaterThanOrEqual(1);
      expect(newState.diceValues[1]).toBe(0);
      // Never stuck on the spot — a wrong answer costs distance, not the turn.
      expect(newState.turnPhase).toBe('MOVING');
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

  describe('payBail & Jail Auto-Release', () => {
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

    it('should auto-release player from jail when startRollPhase sees jailTurns >= MAX_JAIL_TURNS', () => {
      gameState.players[0].isInJail = true;
      gameState.players[0].jailTurns = 2; // MAX_JAIL_TURNS = 2

      const newState = startRollPhase(gameState);
      const player = getCurrentPlayer(newState);

      expect(player.isInJail).toBe(false);
      expect(player.jailTurns).toBe(0);
      expect(newState.turnPhase).toBe('MOVING');
      expect(newState.currentChallenge).toBeNull();
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

  describe('property actions', () => {
    it('still offers the deed when the landing player cannot afford list price', () => {
      const landed: GameState = {
        ...gameState,
        turnPhase: 'RESOLVE_TILE',
        players: gameState.players.map((player, index) => index === 0
          ? { ...player, position: 1, money: 0 }
          : player),
      };

      const offered = resolveTileEvent(landed);

      expect(offered.turnPhase).toBe('BUY_DECISION');
      expect(offered.pendingTileEvent?.tileIndex).toBe(1);
    });

    it('allows only one bank offer attempt for the same deed', () => {
      const offered: GameState = {
        ...gameState,
        turnPhase: 'BUY_DECISION',
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
      };

      const challenge = startSmartBuyChallenge(offered);
      const answered = processSmartBuyAnswer(
        challenge,
        challenge.currentChallenge!.correctIndex,
        1_000
      ).newState;

      expect(answered.turnPhase).toBe('BUY_DECISION');
      expect(answered.pendingTileEvent?.bankOfferAttempted).toBe(true);
      expect(startSmartBuyChallenge(answered)).toBe(answered);
    });

    it('records a Smart Buy fingerprint as soon as the question is issued', () => {
      const offered: GameState = {
        ...gameState,
        turnPhase: 'BUY_DECISION',
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
      };

      const challenged = startSmartBuyChallenge(offered);

      expect(challenged.players[0].recentQuestionFingerprints).toEqual([
        challenged.currentChallenge!.fingerprint,
      ]);
    });

    it('keeps only the eight most recently issued fingerprints', () => {
      const offered: GameState = {
        ...gameState,
        turnPhase: 'BUY_DECISION',
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
      };

      const afterNineIssues = Array.from({ length: 9 }).reduce<GameState>(
        (state) => startSmartBuyChallenge(state),
        offered
      );

      expect(afterNineIssues.players[0].recentQuestionFingerprints).toHaveLength(8);
      expect(afterNineIssues.players[0].recentQuestionFingerprints.at(-1)).toBe(
        afterNineIssues.currentChallenge!.fingerprint
      );
    });

    it('opens an auction and transfers the deed to the highest bidder', () => {
      const offered: GameState = {
        ...gameState,
        turnPhase: 'BUY_DECISION',
        pendingTileEvent: {
          type: 'PROPERTY',
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
      };

      const auction = skipBuy(offered);
      expect(auction.turnPhase).toBe('AUCTION');
      const bid = placeAuctionBid(auction, 'p2', auction.auctionState!.currentBid);
      const settled = resolveAuction(bid);

      expect(settled.turnPhase).toBe('END_TURN');
      expect(settled.properties.find((property) => property.tileIndex === 1)?.ownerId).toBe('p2');
      expect(settled.players[1].properties).toContain(1);
      expect(settled.players[1].money).toBe(STARTING_MONEY - auction.auctionState!.currentBid);
    });

    it('builds a house only after completing the colour set', () => {
      const owned: GameState = {
        ...gameState,
        turnPhase: 'END_TURN',
        players: gameState.players.map((player, index) => index === 0
          ? { ...player, properties: [1, 2] }
          : player),
        properties: gameState.properties.map((property) => [1, 2].includes(property.tileIndex)
          ? { ...property, ownerId: 'p1' }
          : property),
      };

      const built = buildHouse(owned, 1);
      expect(built.properties.find((property) => property.tileIndex === 1)?.isLeveledUp).toBe(true);
      expect(built.players[0].money).toBe(STARTING_MONEY - 40);

      const incomplete = { ...owned, players: owned.players.map((player, index) => index === 0
        ? { ...player, properties: [1] }
        : player) };
      expect(buildHouse(incomplete, 1)).toBe(incomplete);
    });
  });
});

function openLegacyRollChallenge(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex];
  return {
    ...state,
    turnPhase: 'ROLL_CHALLENGE',
    currentChallenge: selectChallenge({
      masteryStates: player.masteryStates,
      context: 'ROLL_CHALLENGE',
      consecutiveFailures: player.consecutiveFailures,
      skillAttempts: player.skillAttempts,
    }),
  };
}
