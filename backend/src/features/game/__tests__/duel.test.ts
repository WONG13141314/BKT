// Phase 4B — the Math Duel.
//
// The fairness rules are the point of this feature, so they are what these
// cover: the payoff matrix, the guarantee that a duel can never cost more than
// the rent, and the fact that both players produce BKT evidence — including the
// owner, who is answering on someone else's turn.

import {
  initializeGameState,
  submitDuelAnswer,
  bothDuellistsAnswered,
  resolveDuel,
} from '../game.engine';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { LANDLORD_BONUS, DUEL_TIME_LIMIT } from '../game.constants';
import type { DuelSide, DuelState, GameState } from '../game.types';

const PLAYERS = [
  { id: 'p1', playerId: 'u1', name: 'Challenger', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'u2', name: 'Landlord', color: '#f59e0b', order: 1 },
];

const RENT = 60;

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
    skillName: 'Addition',
    rentAmount: RENT,
    challenger: makeSide('p1'),
    owner: makeSide('p2'),
    startedAt: Date.now(),
    timeLimit: DUEL_TIME_LIMIT,
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
