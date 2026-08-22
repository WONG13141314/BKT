import {
  initializeGameState,
  getCurrentPlayer,
  startRollPhase,
  resolveTileEvent,
  endTurn,
  calculateFinalScores,
  payBail,
  skipBuy,
  buildHouse,
  startSmartBuyChallenge,
  processSmartBuyAnswer,
  processCardChallengeAnswer,
  startJailMathEscape,
  processJailEscapeAnswer,
} from '../game.engine';
import { GameState } from '../game.types';
import { STARTING_MONEY, BAIL_COST, MAX_ROUNDS } from '../game.constants';
import { gameService } from '../game.service';
import { buildableState, currentPlayer, readyState } from '../../../test/bkt.fixtures';

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
    it('rolls directly into movement', () => {
      const newState = startRollPhase(readyState());

      expect(newState.turnPhase).toBe('MOVING');
      expect(newState.currentChallenge).toBeNull();
      expect(newState.diceCount).toBe(2);
      expect(newState.diceValues.every((value) => value >= 1 && value <= 6)).toBe(true);
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

      const answered = processSmartBuyAnswer(
        challenged,
        challenged.currentChallenge!.correctIndex,
        1_000
      ).newState;
      expect(answered.players[0].recentQuestionFingerprints).toEqual([
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

    it('normalizes legacy restored histories before issuing a Smart Buy question', () => {
      const gameId = 'legacy-question-history';
      const legacyState = {
        ...gameState,
        turnPhase: 'BUY_DECISION' as const,
        pendingTileEvent: {
          type: 'PROPERTY' as const,
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
        players: gameState.players.map(({ recentQuestionFingerprints: _history, ...player }) => player),
      } as unknown as GameState;

      try {
        gameService.replaceState(gameId, legacyState);
        expect(gameService.getGameSync(gameId)!.players.map((player) => player.recentQuestionFingerprints)).toEqual([
          [], [], [], [],
        ]);

        const issued = gameService.startSmartBuy(gameId)!;
        expect(issued.players[0].recentQuestionFingerprints).toEqual([issued.currentChallenge!.fingerprint]);
      } finally {
        gameService.removeGame(gameId);
      }
    });

    it('defensively records a question when a legacy player reaches the engine directly', () => {
      const legacyState = {
        ...gameState,
        turnPhase: 'BUY_DECISION' as const,
        pendingTileEvent: {
          type: 'PROPERTY' as const,
          tileIndex: 1,
          tileName: 'Tambah Alley',
          propertyPrice: 80,
        },
        players: gameState.players.map(({ recentQuestionFingerprints: _history, ...player }) => player),
      } as unknown as GameState;

      const issued = startSmartBuyChallenge(legacyState);

      expect(issued.players[0].recentQuestionFingerprints).toEqual([issued.currentChallenge!.fingerprint]);
    });

    it('records a Challenge Card fingerprint once at issue time, not answer time', () => {
      const card = resolveTileEvent({
        ...gameState,
        turnPhase: 'RESOLVE_TILE',
        challengeCardDeck: [8],
        challengeCardIndex: 0,
        players: gameState.players.map((player, index) => index === 0 ? { ...player, position: 3 } : player),
      });
      const history = card.players[0].recentQuestionFingerprints;

      expect(history).toEqual([card.currentChallenge!.fingerprint]);
      const answered = processCardChallengeAnswer(card, card.currentChallenge!.correctIndex, 1_000).newState;
      expect(answered.players[0].recentQuestionFingerprints).toEqual(history);
    });

    it('records a Jail Escape fingerprint once at issue time, not answer time', () => {
      const challenge = startJailMathEscape({
        ...gameState,
        turnPhase: 'JAIL_DECISION',
        players: gameState.players.map((player, index) => index === 0 ? { ...player, isInJail: true } : player),
      });
      const history = challenge.players[0].recentQuestionFingerprints;

      expect(history).toEqual([challenge.currentChallenge!.fingerprint]);
      const answered = processJailEscapeAnswer(challenge, challenge.currentChallenge!.correctIndex, 1_000).newState;
      expect(answered.players[0].recentQuestionFingerprints).toEqual(history);
    });

    it('leaves a declined property unowned and ends the landing decision', () => {
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

      const next = skipBuy(offered);

      expect(next.turnPhase).toBe('END_TURN');
      expect(next.properties.find((property) => property.tileIndex === offered.pendingTileEvent!.tileIndex)?.ownerId).toBeNull();
      expect(next.pendingTileEvent).toBeNull();
    });

    it('does not change a turn that is not awaiting a purchase decision', () => {
      expect(skipBuy(gameState)).toBe(gameState);
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

    it('keeps direct house building and free level-up tokens', () => {
      const propertyIndex = 1;
      const next = buildHouse(buildableState({ hasLevelUpToken: true }), propertyIndex);

      expect(next.properties.find((property) => property.tileIndex === propertyIndex)?.isLeveledUp).toBe(true);
      expect(currentPlayer(next).hasLevelUpToken).toBe(false);
    });

    it.each(['ROLL_CHALLENGE', 'LEVEL_UP_OFFER', 'LEVEL_UP_CHALLENGE'] as const)(
      'restores legacy %s games into an end-turn state',
      (turnPhase) => {
        const gameId = `legacy-${turnPhase}`;
        const legacyState = {
          ...readyState(),
          turnPhase,
          currentChallenge: { id: 'obsolete' },
          pendingTileEvent: { type: 'PROPERTY', tileIndex: 1, tileName: 'Tambah Alley' },
          phaseDeadline: 100,
          phaseDeadlineFor: turnPhase,
        } as unknown as GameState;

        try {
          const restored = gameService.replaceState(gameId, legacyState);

          expect(restored.turnPhase).toBe('END_TURN');
          expect(restored.currentChallenge).toBeNull();
          expect(restored.pendingTileEvent).toBeNull();
          expect(restored.phaseDeadline).toBeNull();
          expect(restored.phaseDeadlineFor).toBeNull();
        } finally {
          gameService.removeGame(gameId);
        }
      }
    );
  });
});
