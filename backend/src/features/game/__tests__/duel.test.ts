// Phase 4B — the Math Duel.
//
// The fairness rules are the point of this feature, so they are what these
// cover: the payoff matrix, the guarantee that a duel can never cost more than
// the rent, and the fact that both players produce BKT evidence — including the
// owner, who is answering on someone else's turn.

import {
  initializeGameState,
  expireDuelSides,
  nextDuelDeadline,
  resolveTileEvent,
  submitDuelAnswer,
  bothDuellistsAnswered,
  resolveDuel,
} from '../game.engine';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { LANDLORD_BONUS } from '../game.constants';
import type { DuelSide, DuelState, GameState } from '../game.types';

const PLAYERS = [
  { id: 'p1', playerId: 'u1', name: 'Challenger', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'u2', name: 'Landlord', color: '#f59e0b', order: 1 },
];

const RENT = 60;

function withSeededRandom<T>(seed: number, action: () => T): T {
  const originalRandom = Math.random;
  let state = seed;
  Math.random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };

  try {
    return action();
  } finally {
    Math.random = originalRandom;
  }
}

function stateLandingOnOwnedProperty(mastery: number = 0.5) {
  const state = initializeGameState('game_DUEL_LIVE', PLAYERS);
  const masteryStates = {
    Addition: mastery,
    Subtraction: mastery,
    Multiplication: mastery,
    Division: mastery,
  };
  const skillAttempts = {
    Addition: 10,
    Subtraction: 10,
    Multiplication: 10,
    Division: 10,
  };

  return {
    ...state,
    players: state.players.map((player, index) => ({
      ...player,
      position: index === 0 ? 1 : player.position,
      masteryStates,
      skillAttempts,
    })),
    properties: state.properties.map((property) => property.tileIndex === 1
      ? { ...property, ownerId: state.players[1].id }
      : property),
  };
}

function makeSide(playerId: string): DuelSide {
  return {
    playerId,
    challenge: selectChallenge({
      masteryStates: {},
      context: 'MATH_DUEL',
      consecutiveFailures: {},
      forceSkill: 'Addition',
    }),
    selectedIndex: null,
    isCorrect: null,
    timeMs: null,
    previousMastery: null,
    newMastery: null,
  };
}

function stateWithDuel(): GameState {
  const base = initializeGameState('game_DUEL', PLAYERS);
  const duel: DuelState = {
    tileIndex: 3,
    tileName: 'Tambah Alley',
    rentAmount: RENT,
    challenger: makeSide('p1'),
    owner: makeSide('p2'),
    startedAt: Date.now(),
    resolution: null,
  };

  return { ...base, turnPhase: 'MATH_DUEL', duelState: duel };
}

/** Answer as one side, correctly or not. */
function answer(state: GameState, who: 'challenger' | 'owner', correct: boolean): GameState {
  const side = state.duelState![who];
  const index = correct
    ? side.challenge.correctIndex
    : (side.challenge.correctIndex + 1) % side.challenge.options.length;

  return submitDuelAnswer(state, side.playerId, index, 2500);
}

function play(challengerCorrect: boolean, ownerCorrect: boolean) {
  let state = stateWithDuel();
  const before = { challenger: state.players[0].money, owner: state.players[1].money };

  state = answer(state, 'challenger', challengerCorrect);
  state = answer(state, 'owner', ownerCorrect);

  const settled = resolveDuel(state);
  return {
    before,
    resolution: settled.resolution,
    duel: settled.duel,
    state: settled.newState,
    challengerPaid: before.challenger - settled.newState.players[0].money,
    ownerGained: settled.newState.players[1].money - before.owner,
  };
}

describe('Duel payoff matrix', () => {
  it('challenger right, owner wrong → no rent at all', () => {
    const r = play(true, false);

    expect(r.resolution.outcome).toBe('CHALLENGER_WINS');
    expect(r.challengerPaid).toBe(0);
    expect(r.ownerGained).toBe(0);
  });

  it('both right → rent halved, and the bank pays the landlord', () => {
    const r = play(true, true);

    expect(r.resolution.outcome).toBe('DRAW_BOTH');
    expect(r.challengerPaid).toBe(RENT / 2);
    // The owner receives the half rent plus a bonus that did NOT come out of
    // the challenger's pocket — winning must never cost the other child extra.
    expect(r.ownerGained).toBe(RENT / 2 + LANDLORD_BONUS);
    expect(r.resolution.landlordBonus).toBe(LANDLORD_BONUS);
  });

  it('challenger wrong, owner right → normal rent, plus a bank bonus', () => {
    const r = play(false, true);

    expect(r.resolution.outcome).toBe('OWNER_WINS');
    expect(r.challengerPaid).toBe(RENT);
    expect(r.ownerGained).toBe(RENT + LANDLORD_BONUS);
  });

  it('both wrong → exactly the rent that was already owed', () => {
    const r = play(false, false);

    expect(r.resolution.outcome).toBe('DRAW_NEITHER');
    expect(r.challengerPaid).toBe(RENT);
    expect(r.ownerGained).toBe(RENT);
    expect(r.resolution.landlordBonus).toBe(0);
  });

  it('never costs the challenger more than the plain rent', () => {
    // The core fairness guarantee: a duel is upside-only. A child who is
    // struggling pays what they would have paid anyway, so failure never
    // compounds into a spiral.
    for (const challengerCorrect of [true, false]) {
      for (const ownerCorrect of [true, false]) {
        const r = play(challengerCorrect, ownerCorrect);
        expect(r.challengerPaid).toBeLessThanOrEqual(RENT);
      }
    }
  });

  it('rewards the challenger for answering well, whatever the owner does', () => {
    expect(play(true, true).challengerPaid).toBeLessThan(play(false, true).challengerPaid);
    expect(play(true, false).challengerPaid).toBeLessThan(play(false, false).challengerPaid);
  });
});

describe('Duel mechanics', () => {
  it('keeps all four skills reachable in live property duels', () => {
    const observed = withSeededRandom(0xD0E1, () => {
      const skills = new Set<string>();

      for (let draw = 0; draw < 600; draw += 1) {
        const next = resolveTileEvent(stateLandingOnOwnedProperty());
        const duel = next.duelState!;
        skills.add(duel.challenger.challenge.skillName);
        skills.add(duel.owner.challenge.skillName);
      }

      return skills;
    });

    expect([...observed].sort()).toEqual(['Addition', 'Division', 'Multiplication', 'Subtraction']);
  });

  it.each([
    [0.2, 1, 25],
    [0.6, 2, 20],
    [0.9, 3, 15],
  ] as const)('gives live difficulty %s duellists a %s-second private question', (mastery, difficulty, seconds) => {
    const duel = resolveTileEvent(stateLandingOnOwnedProperty(mastery)).duelState!;

    for (const side of [duel.challenger, duel.owner]) {
      expect(side.challenge.difficulty).toBe(difficulty);
      expect(side.challenge.timeLimit).toBe(seconds);
      expect(side.challenge.startedAt + side.challenge.timeLimit * 1_000).toBe(
        duel.startedAt + seconds * 1_000
      );
    }
  });

  it('expires each duel side at its own question deadline', () => {
    const state = stateWithDuel();
    const duel = state.duelState!;
    const timed = {
      ...state,
      duelState: {
        ...duel,
        challenger: { ...duel.challenger, challenge: { ...duel.challenger.challenge, startedAt: 1_000, timeLimit: 25 } },
        owner: { ...duel.owner, challenge: { ...duel.owner.challenge, startedAt: 1_000, timeLimit: 15 } },
      },
    };

    const afterHardDeadline = expireDuelSides(timed, 16_000);
    expect(afterHardDeadline.duelState!.challenger.timedOut).not.toBe(true);
    expect(afterHardDeadline.duelState!.owner.timedOut).toBe(true);
    expect(nextDuelDeadline(afterHardDeadline.duelState!)).toBe(26_000);
    expect(bothDuellistsAnswered(afterHardDeadline)).toBe(false);

    const afterEasyDeadline = expireDuelSides(afterHardDeadline, 26_000);
    expect(afterEasyDeadline.duelState!.challenger.timedOut).toBe(true);
    expect(bothDuellistsAnswered(afterEasyDeadline)).toBe(true);
  });

  it('gives both duellists the same skill', () => {
    const state = stateWithDuel();

    expect(state.duelState!.challenger.challenge.skillName).toBe('Addition');
    expect(state.duelState!.owner.challenge.skillName).toBe('Addition');
  });

  it('waits for both sides before it can settle', () => {
    let state = stateWithDuel();
    expect(bothDuellistsAnswered(state)).toBe(false);

    state = answer(state, 'challenger', true);
    expect(bothDuellistsAnswered(state)).toBe(false);

    state = answer(state, 'owner', true);
    expect(bothDuellistsAnswered(state)).toBe(true);
  });

  it('ignores a second submission from the same player', () => {
    let state = stateWithDuel();
    state = answer(state, 'challenger', false);
    const firstChoice = state.duelState!.challenger.selectedIndex;

    // A resubmission must not overwrite a graded answer.
    state = answer(state, 'challenger', true);
    expect(state.duelState!.challenger.selectedIndex).toBe(firstChoice);
    expect(state.duelState!.challenger.isCorrect).toBe(false);
  });

  it('ignores answers from players who are not in the duel', () => {
    const state = stateWithDuel();
    const unchanged = submitDuelAnswer(state, 'p9', 0, 1000);

    expect(unchanged.duelState!.challenger.selectedIndex).toBeNull();
    expect(unchanged.duelState!.owner.selectedIndex).toBeNull();
  });

  it('grades a side that ran out of time as wrong, without blocking the other', () => {
    let state = stateWithDuel();
    state = answer(state, 'challenger', true);

    // Owner never answers — the deadline forces a resolution.
    const settled = resolveDuel(state);

    expect(settled.duel.owner.isCorrect).toBe(false);
    expect(settled.resolution.outcome).toBe('CHALLENGER_WINS');
    // The challenger's result does not depend on the owner's connection.
    expect(settled.newState.players[0].money).toBe(state.players[0].money);
  });

  it('records a BKT observation for both players, including the owner', () => {
    const state = stateWithDuel();
    const settled = resolveDuel(answer(answer(state, 'challenger', true), 'owner', false));

    for (const side of [settled.duel.challenger, settled.duel.owner]) {
      expect(side.previousMastery).not.toBeNull();
      expect(side.newMastery).not.toBeNull();
    }

    // The owner answered on someone else's turn — this is the only mechanic in
    // the game that produces evidence off-turn.
    const owner = settled.newState.players[1];
    expect(owner.totalQuestions).toBe(1);
    expect(owner.skillAttempts.Addition).toBe(1);

    // A correct answer raises mastery.
    expect(settled.duel.challenger.newMastery!).toBeGreaterThan(
      settled.duel.challenger.previousMastery!
    );

    // The wrong answer is worth strictly less than the right one. Note it does
    // not necessarily *fall*: standard BKT applies the learn rate on every
    // opportunity, so from a low prior even a wrong answer can nudge P(L) up.
    // What must hold is that being wrong leaves you below being right.
    expect(settled.duel.owner.previousMastery).toBeCloseTo(
      settled.duel.challenger.previousMastery!
    );
    expect(settled.duel.owner.newMastery!).toBeLessThan(settled.duel.challenger.newMastery!);
  });

  it('hands the turn back once settled', () => {
    const settled = resolveDuel(answer(answer(stateWithDuel(), 'challenger', true), 'owner', true));

    expect(settled.newState.turnPhase).toBe('END_TURN');
    expect(settled.newState.pendingTileEvent).toBeNull();
  });
});
