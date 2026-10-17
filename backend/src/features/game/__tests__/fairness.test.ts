// Fairness rules: turn order, card timeouts, Rent Shield timing and discounts.

import {
  initializeGameState,
  submitDuelAnswer,
  resolveDuel,
  resolveTileEvent,
  processCardChallengeAnswer,
  buyPropertyFullPrice,
  purchaseQuote,
} from '../game.engine';
import { getCardById } from '../card.deck';
import { BOARD_TILES } from '../board.config';
import { shuffleTurnOrder } from '../../../sockets/lobby.manager';
import { makePrivateChallenge } from '../../../test/game.fixtures';
import { gameService } from '../../../test/game.service';
import { registerLobbyHandlers, roomManager } from '../../../test/socket.runtime';
import { SocketPresence } from '../../../sockets/presence.manager';
import { makeServer, makeSocket } from '../../../sockets/__tests__/socket.harness';
import { LANDLORD_BONUS } from '../game.constants';
import type { GameState } from '../game.types';

const PLAYERS = [
  { id: 'p1', playerId: 'u1', name: 'Aina', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'u2', name: 'Ben', color: '#f59e0b', order: 1 },
];

describe('turn order', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps every seat exactly once', () => {
    const seats = ['host', 'second', 'third', 'fourth'];
    const order = shuffleTurnOrder(seats);
    expect([...order].sort()).toEqual([...seats].sort());
    expect(seats).toEqual(['host', 'second', 'third', 'fourth']);
  });

  it('gives every lobby position an even chance of rolling first', () => {
    const seats = ['host', 'second', 'third', 'fourth'];
    const first: Record<string, number> = {};
    for (let n = 0; n < 8_000; n++) {
      const leader = shuffleTurnOrder(seats)[0];
      first[leader] = (first[leader] ?? 0) + 1;
    }
    for (const seat of seats) expect(first[seat] / 8_000).toBeGreaterThan(0.22);
    for (const seat of seats) expect(first[seat] / 8_000).toBeLessThan(0.28);
  });

  it('starts a lobby game in shuffled order rather than join order', async () => {
    // Fisher-Yates with random() = 0 moves the host from the front.
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const host = makeSocket({ player: { id: 'order-host', displayName: 'Host', avatar: 'ship' } });
    const room = roomManager.createRoom('order-host', 'Host', 'ship');
    roomManager.addBot(room.code, 'order-host');
    const presence = new SocketPresence();
    presence.connect('order-host', host.id);
    const createGame = jest.spyOn(gameService, 'createGame').mockImplementation(async (id, seats) =>
      gameService.replaceState(id, initializeGameState(id, seats)));
    registerLobbyHandlers(makeServer([host], `game_${room.code}`), host, presence);

    await host.trigger('room:start');

    const seats = createGame.mock.calls[0][1];
    expect(seats[0].playerId).not.toBe('order-host');
    expect(seats.map((seat) => seat.order)).toEqual([0, 1]);
    gameService.removeGame(`game_${room.code}`);
    roomManager.removePlayer('order-host');
  });
});

describe('math card timeouts', () => {
  it('gives a timeout the same consolation as a wrong answer, so guessing does not beat thinking', () => {
    const card = getCardById(8)!; // Bonus Besar: RM120 correct, RM40 wrong
    const challenge = makePrivateChallenge({ startedAt: 1_000, timeLimit: 20 });
    const base = initializeGameState('game_CARD', PLAYERS);
    const open: GameState = {
      ...base,
      turnPhase: 'CARD_MATH_CHALLENGE',
      currentChallenge: challenge,
      pendingTileEvent: { type: 'CHALLENGE_CARD', tileIndex: 3, tileName: 'Challenge Card', card },
    };
    const money = open.players[0].money;

    const wrong = processCardChallengeAnswer(open, (challenge.correctIndex + 1) % 4, 2_000);
    const timedOut = processCardChallengeAnswer(open, null, 30_000);

    expect(wrong.newState.players[0].money).toBe(money + 40);
    expect(timedOut.newState.players[0].money).toBe(money + 40);
    expect(timedOut.result.timedOut).toBe(true);
    expect(timedOut.result.reward.description).toContain('Time ran out');
    // A timeout is still not BKT evidence.
    expect(timedOut.result.newMastery).toBe(timedOut.result.previousMastery);
  });
});

describe('Rent Shield', () => {
  /** P1 lands on P2's Tambah Alley holding a Rent Shield. */
  function landOnRentWithShield(): GameState {
    const base = initializeGameState('game_SHIELD', PLAYERS);
    return resolveTileEvent({
      ...base,
      players: base.players.map((p, i) => i === 0
        ? { ...p, position: 1, hasRentShield: true }
        : { ...p, properties: [1] }),
      properties: base.properties.map((p) => p.tileIndex === 1 ? { ...p, ownerId: 'p2' } : p),
    });
  }

  function settle(state: GameState, challengerCorrect: boolean, ownerCorrect = false) {
    const duel = state.duelState!;
    const pick = (correct: boolean, index: number) => correct ? index : (index + 1) % 4;
    let next = submitDuelAnswer(state, 'p1', pick(challengerCorrect, duel.challenger.challenge.correctIndex),
      duel.challenger.challenge.startedAt + 500);
    next = submitDuelAnswer(next, 'p2', pick(ownerCorrect, duel.owner.challenge.correctIndex),
      duel.owner.challenge.startedAt + 500);
    return resolveDuel(next);
  }

  it('still runs the duel, so both learners answer a question', () => {
    const state = landOnRentWithShield();
    expect(state.turnPhase).toBe('MATH_DUEL');
    expect(state.duelState).not.toBeNull();
  });

  it('cancels the rent owed after a lost duel and is then used up', () => {
    const before = landOnRentWithShield();
    const { newState, resolution } = settle(before, false, true);

    expect(resolution.outcome).toBe('OWNER_WINS');
    expect(resolution.rentPaid).toBe(0);
    expect(resolution.shieldBlocked).toBe(BOARD_TILES[1].baseRent);
    expect(resolution.headline).toContain('Rent Shield');
    expect(newState.players[0].money).toBe(before.players[0].money);
    // The bank still pays the owner's bonus for a correct defence.
    expect(newState.players[1].money).toBe(before.players[1].money + LANDLORD_BONUS);
    expect(newState.players[0].hasRentShield).toBe(false);
  });

  it('is kept when the learner wins the duel and owes nothing', () => {
    const { newState, resolution } = settle(landOnRentWithShield(), true, false);

    expect(resolution.rentPaid).toBe(0);
    expect(resolution.shieldBlocked).toBeUndefined();
    expect(newState.players[0].hasRentShield).toBe(true);
  });
});

describe('purchase discounts', () => {
  const tile = BOARD_TILES[4]; // RM120

  function buying(price: number, hasDiscountToken: boolean): GameState {
    const base = initializeGameState('game_BUY', PLAYERS);
    return {
      ...base,
      turnPhase: 'BUY_DECISION',
      players: base.players.map((p, i) => i === 0 ? { ...p, hasDiscountToken } : p),
      pendingTileEvent: {
        type: 'PROPERTY', tileIndex: tile.index, tileName: tile.name, propertyPrice: price,
        propertyOwner: null, bankOfferAttempted: price !== tile.price, bankOfferApproved: price !== tile.price,
      },
    };
  }

  it('never stacks a Bank Offer and a discount token', () => {
    // Bank Offer 20% off (RM96) plus token used to give RM67 (45% off).
    const state = buying(96, true);
    const after = buyPropertyFullPrice(state);
    expect(state.players[0].money - after.players[0].money).toBe(84); // 30% off the listed RM120
    expect(after.players[0].hasDiscountToken).toBe(false);
  });

  it('keeps the token when the price on offer is already lower', () => {
    const state = buying(80, true);
    expect(purchaseQuote(state)).toEqual({ price: 80, usesDiscountToken: false });
    const after = buyPropertyFullPrice(state);
    expect(after.players[0].hasDiscountToken).toBe(true);
  });

  it('still applies the token to a full-price purchase', () => {
    expect(purchaseQuote(buying(120, true))).toEqual({ price: 84, usesDiscountToken: true });
    expect(purchaseQuote(buying(120, false))).toEqual({ price: 120, usesDiscountToken: false });
  });
});
