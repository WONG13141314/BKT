// Phase 6 repairs — defects found in a full read-through after Phase 4.
//
// Each block names the failure it prevents, because none of these are obvious
// from the code alone.

import {
  initializeGameState,
  startJailMathEscape,
  processJailEscapeAnswer,
  payBail,
  waitInJail,
  acknowledgeCard,
  generateMasteryReport,
} from '../game.engine';
import { applyForgetting } from '../../../bkt/bkt.engine';
import { INITIAL_MASTERY, FORGETTING_HALF_LIFE_DAYS, MASTERY_THRESHOLD } from '../../../bkt/bkt.defaults';
import { MAX_JAIL_TURNS } from '../game.constants';
import type { GameState } from '../game.types';

const PLAYERS = [
  { id: 'p1', playerId: 'u1', name: 'Alice', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'u2', name: 'Bob', color: '#f59e0b', order: 1 },
];

/** Put the current player in jail with a failed Roll Challenge behind them. */
function jailedAfterFailedRoll(): GameState {
  const base = initializeGameState('game_JAIL', PLAYERS);
  return {
    ...base,
    diceCount: 1,
    diceValues: [4, 0],
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, isInJail: true, jailTurns: 0 } : p
    ),
  };
}

describe('Leaving jail resets the dice count', () => {
  // The three jail exits rolled two dice but left `diceCount` at whatever the
  // last Roll Challenge set it to. The board then showed one die and a crossed
  // out slot while the token moved the distance of two.

  it('after escaping with a correct answer', () => {
    // A jailed player is offered the escape question, not a Roll Challenge.
    const offered = startJailMathEscape(jailedAfterFailedRoll());
    expect(offered.turnPhase).toBe('JAIL_CHALLENGE');

    const { newState } = processJailEscapeAnswer(
      offered,
      offered.currentChallenge!.correctIndex,
      3000
    );

    expect(newState.turnPhase).toBe('MOVING');
    expect(newState.diceCount).toBe(2);
    expect(newState.diceValues[1]).toBeGreaterThanOrEqual(1);
  });

  it('after paying bail', () => {
    const next = payBail(jailedAfterFailedRoll());

    expect(next.turnPhase).toBe('MOVING');
    expect(next.diceCount).toBe(2);
    expect(next.diceValues[1]).toBeGreaterThanOrEqual(1);
  });

  it('after serving the full sentence', () => {
    const jailed = jailedAfterFailedRoll();
    const nearRelease = {
      ...jailed,
      players: jailed.players.map((p, i) =>
        i === 0 ? { ...p, jailTurns: MAX_JAIL_TURNS - 1 } : p
      ),
    };

    const next = waitInJail(nearRelease);

    expect(next.turnPhase).toBe('MOVING');
    expect(next.diceCount).toBe(2);
    expect(next.diceValues[1]).toBeGreaterThanOrEqual(1);
  });
});

describe('Movement cards resolve where they land', () => {
  // "Lompat!" and "Undur!" moved the token and then ended the turn, so a player
  // could be teleported onto an unowned property and never be offered it, or
  // onto an opponent's and pay no rent.

  const cardTile = 3; // A Challenge Card tile.

  function drewCardThenMoved(landedOn: number): GameState {
    const base = initializeGameState('game_CARD', PLAYERS);
    return {
      ...base,
      turnPhase: 'CARD_DRAW',
      players: base.players.map((p, i) => (i === 0 ? { ...p, position: landedOn } : p)),
      pendingTileEvent: {
        type: 'CHALLENGE_CARD',
        tileIndex: cardTile,
        tileName: 'Challenge Card',
      },
    };
  }

  it('resolves the destination when the card moved the player', () => {
    const next = acknowledgeCard(drewCardThenMoved(1));
    expect(next.turnPhase).toBe('RESOLVE_TILE');
  });

  it('ends the turn normally when the card did not move anyone', () => {
    const next = acknowledgeCard(drewCardThenMoved(cardTile));
    expect(next.turnPhase).toBe('END_TURN');
  });

  it('does not resolve a tile when the card sent the player to jail', () => {
    // "Polis!" moves you too, but jail is the entire outcome.
    const moved = drewCardThenMoved(5);
    const jailed = {
      ...moved,
      players: moved.players.map((p, i) => (i === 0 ? { ...p, isInJail: true } : p)),
    };

    expect(acknowledgeCard(jailed).turnPhase).toBe('END_TURN');
  });
});

describe('Forgetting', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date('2026-07-27T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * day);

  it('leaves a skill practised today untouched', () => {
    expect(applyForgetting(0.9, now, now)).toBeCloseTo(0.9);
  });

  it('loses half the gain above the prior after one half-life', () => {
    // 0.9 is 0.8 above the 0.10 prior; half of that gain should remain.
    const decayed = applyForgetting(0.9, daysAgo(FORGETTING_HALF_LIFE_DAYS), now);
    expect(decayed).toBeCloseTo(INITIAL_MASTERY + 0.8 / 2, 5);
  });

  it('decays further the longer the gap', () => {
    const week = applyForgetting(0.9, daysAgo(7), now);
    const month = applyForgetting(0.9, daysAgo(30), now);
    const term = applyForgetting(0.9, daysAgo(90), now);

    expect(week).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(term);
    expect(week).toBeLessThan(0.9);
  });

  it('never falls below the starting prior', () => {
    // Forgetting returns you to a beginner, not to worse than one.
    expect(applyForgetting(0.99, daysAgo(3650), now)).toBeGreaterThanOrEqual(INITIAL_MASTERY);
    expect(applyForgetting(0.05, daysAgo(3650), now)).toBeCloseTo(0.05);
  });

  it('does nothing without a practice date', () => {
    expect(applyForgetting(0.9, null, now)).toBeCloseTo(0.9);
  });

  it('is idempotent — recomputing from the stored value cannot compound', () => {
    // Decay is a pure function of elapsed time and is never written back, so
    // loading a profile twice must give the same answer both times.
    const once = applyForgetting(0.9, daysAgo(30), now);
    const twice = applyForgetting(0.9, daysAgo(30), now);
    expect(once).toBe(twice);
  });
});

describe('Mastery report', () => {
  it('reports the real number of questions asked per skill', () => {
    const state = initializeGameState('game_REPORT', PLAYERS);
    const player = {
      ...state.players[0],
      skillAttempts: { Addition: 7, Subtraction: 0, Multiplication: 2, Division: 4 },
      masteryStates: { Addition: 0.9, Subtraction: 0.1, Multiplication: 0.4, Division: 0.6 },
      totalQuestions: 13,
      totalCorrect: 9,
    };

    const report = generateMasteryReport(player);
    const addition = report.skills.find((s) => s.skillName === 'Addition')!;

    // Was hard-coded to 0 with a note that per-skill tracking would be needed.
    expect(addition.totalAttempts).toBe(7);
    expect(addition.isMastered).toBe(true);
  });

  it('flags mastery against the threshold', () => {
    const state = initializeGameState('game_REPORT', PLAYERS);
    const justUnder = MASTERY_THRESHOLD - 0.01;

    const report = generateMasteryReport({
      ...state.players[0],
      skillAttempts: { Addition: 10, Subtraction: 10, Multiplication: 10, Division: 10 },
      masteryStates: {
        Addition: MASTERY_THRESHOLD,
        Subtraction: justUnder,
        Multiplication: 0.2,
        Division: 0.2,
      },
    });

    expect(report.skills.find((s) => s.skillName === 'Addition')!.isMastered).toBe(true);
    expect(report.skills.find((s) => s.skillName === 'Subtraction')!.isMastered).toBe(false);
  });

  it('ranks only skills that were actually practised', () => {
    const state = initializeGameState('game_REPORT', PLAYERS);

    const report = generateMasteryReport({
      ...state.players[0],
      skillAttempts: { Addition: 5, Subtraction: 0, Multiplication: 0, Division: 3 },
      masteryStates: { Addition: 0.8, Subtraction: 0.1, Multiplication: 0.1, Division: 0.3 },
    });

    // An untouched skill sits at the prior and would otherwise always be named
    // "needs work", which says nothing about the player.
    expect(report.bestSkill).toBe('Addition');
    expect(report.weakestSkill).toBe('Division');
  });
});
