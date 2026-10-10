// Phase 3 — the durable learner model.
//
// Returning-player initialization and exact research rows are tested without
// database access. Actual SQL evidence rules run in the isolated PGlite suite.

import { initializeGameState } from '../game.engine';
import {
  buildAttemptData,
  isRecordablePlayer,
} from '../game.persistence.shared';
import type { AttemptRecord, PlayerPriors } from '../game.persistence.types';
import { createGameService } from '../game.runtime';
import { INITIAL_MASTERY } from '../../../bkt/bkt.defaults';
import { getAdjustedParams } from '../../../bkt/bkt.selector';
import { QUESTION_TIMING_POLICY_VERSION, SKILL_NAMES } from '../game.constants';
import type { MathChallenge, PlayerState } from '../game.types';

const BASE_PLAYERS = [
  { id: 'p1', playerId: 'db-alice', name: 'Alice', color: '#6366f1', order: 0 },
  { id: 'p2', playerId: 'bot_1', name: 'Bot', color: '#f59e0b', order: 1, isBot: true },
];

function makeChallenge(overrides: Partial<MathChallenge> = {}): MathChallenge {
  return {
    id: 'challenge_1',
    skillName: 'Division',
    difficulty: 2,
    questionData: {
      type: 'long_division', divisor: 4, dividend: 84, quotient: 21, remainder: 0,
      steps: [
        { quotientDigit: 2, product: 8, subtractionResult: 0, broughtDownDigit: 4 },
        { quotientDigit: 1, product: 4, subtractionResult: 0, broughtDownDigit: null },
      ],
      missingTarget: 'quotient_digit', missingStepIndex: 1,
    },
    text: '84 ÷ 4 = ?',
    options: ['19', '21', '24', '26'],
    correctIndex: 1,
    context: 'SMART_BUY',
    timeLimit: 15,
    startedAt: Date.now(),
    fingerprint: 'division:84:4:quotient_digit:1',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  const state = initializeGameState('game_TEST01', BASE_PLAYERS);
  return {
    player: state.players[0],
    dbGameId: state.dbGameId,
    challenge: makeChallenge(),
    selectedIndex: 1,
    timeMs: 4200,
    previousMastery: 0.3,
    newMastery: 0.42,
    isCorrect: true,
    ...overrides,
  };
}

describe('Resuming mastery across sessions', () => {
  it('seeds a returning player from their stored P(L)', () => {
    const state = initializeGameState('game_TEST01', [
      { ...BASE_PLAYERS[0], masteryPriors: { Division: 0.72, Addition: 0.15 } },
      BASE_PLAYERS[1],
    ]);

    expect(state.players[0].masteryStates.Division).toBeCloseTo(0.72);
    expect(state.players[0].masteryStates.Addition).toBeCloseTo(0.15);
  });

  it('falls back to the default for skills with no history', () => {
    const state = initializeGameState('game_TEST01', [
      { ...BASE_PLAYERS[0], masteryPriors: { Division: 0.72 } },
      BASE_PLAYERS[1],
    ]);

    // Practised skill resumes; the other three start fresh.
    expect(state.players[0].masteryStates.Division).toBeCloseTo(0.72);
    for (const skill of SKILL_NAMES.filter((s) => s !== 'Division')) {
      expect(state.players[0].masteryStates[skill]).toBeCloseTo(INITIAL_MASTERY);
    }
  });

  it('starts a first-time player at the default across all four skills', () => {
    const state = initializeGameState('game_TEST01', BASE_PLAYERS);

    for (const skill of SKILL_NAMES) {
      expect(state.players[0].masteryStates[skill]).toBeCloseTo(INITIAL_MASTERY);
    }
  });

  it('gives each match its own durable id, since room codes are recycled', () => {
    const first = initializeGameState('game_TEST01', BASE_PLAYERS);
    const second = initializeGameState('game_TEST01', BASE_PLAYERS);

    expect(first.id).toBe(second.id);
    expect(first.dbGameId).not.toBe(second.dbGameId);
  });
});

describe('Runtime prior read barriers', () => {
  it('does not expose a new game before its saved mastery read completes', async () => {
    let releaseRead!: (priors: Map<string, PlayerPriors>) => void;
    const readGate = new Promise<Map<string, PlayerPriors>>((resolve) => { releaseRead = resolve; });
    const loadMasteryPriorsAfterWrites = jest.fn(() => readGate);
    const service = createGameService({ persistence: {
      loadMasteryPriorsAfterWrites, newGameId: () => crypto.randomUUID(), recordAttempt: () => {},
    } });

    const creating = service.createGame('game_PRIOR_BARRIER', BASE_PLAYERS);
    expect(loadMasteryPriorsAfterWrites).toHaveBeenCalledWith(['db-alice']);
    expect(service.getGameSync('game_PRIOR_BARRIER')).toBeNull();
    releaseRead(new Map());
    expect((await creating).players[0].masteryStates.Addition).toBe(INITIAL_MASTERY);
  });

  it('starts with the latest mastery and independent evidence supplied by the persistence barrier', async () => {
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const latest = new Map([['db-alice', { mastery: { Addition: 0.82 }, attempts: { Addition: 6 } }]]);
    const barrier = jest.fn(async () => {
      await readGate;
      return latest;
    });
    const service = createGameService({ persistence: {
      loadMasteryPriorsAfterWrites: barrier,
      newGameId: () => crypto.randomUUID(), recordAttempt: () => {},
    } });

    const creating = service.createGame('game_QUEUE_BARRIER', [BASE_PLAYERS[0]]);
    expect(barrier).toHaveBeenCalledWith(['db-alice']);
    releaseRead();

    const state = await creating;
    expect(state.players[0].masteryStates.Addition).toBe(0.82);
    expect(state.players[0].skillAttempts.Addition).toBe(6);
  });
});

describe('Attempt rows', () => {
  const answeredAt = new Date('2026-07-26T10:00:00Z');

  it('records what the player picked alongside the correct answer', () => {
    const data = buildAttemptData(makeRecord(), 'skill-division', 1, answeredAt);

    expect(data.selectedAnswer).toBe('21');
    expect(data.correctAnswer).toBe('21');
    expect(data.isCorrect).toBe(true);
    expect(data.timedOut).toBe(false);
    expect(data.skillId).toBe('skill-division');
    expect(data.difficulty).toBe(2);
    expect(data.context).toBe('SMART_BUY');
    expect(data.hintLevel).toBe(0);
    expect(data.timeMs).toBe(4200);
  });

  it('stores the prediction the model made before it saw the answer', () => {
    const record = makeRecord({ previousMastery: 0.3, challenge: makeChallenge({ difficulty: 2 }) });
    const data = buildAttemptData(record, 'skill-division', 1, answeredAt);

    // P(correct) = P(L)·(1 − P(S)) + (1 − P(L))·P(G)
    const { pG, pS } = getAdjustedParams(2);
    expect(data.predictedPCorrect).toBeCloseTo(0.3 * (1 - pS) + 0.7 * pG);

    // Unrecoverable later, so both sides of the update must be on the row.
    expect(data.pMasteryBefore).toBeCloseTo(0.3);
    expect(data.pMasteryAfter).toBeCloseTo(0.42);
  });

  it('predicts higher for an easier question at the same mastery', () => {
    const easy = buildAttemptData(
      makeRecord({ challenge: makeChallenge({ difficulty: 1 }) }),
      'skill-division',
      1,
      answeredAt
    );
    const hard = buildAttemptData(
      makeRecord({ challenge: makeChallenge({ difficulty: 3 }) }),
      'skill-division',
      1,
      answeredAt
    );

    expect(easy.predictedPCorrect).toBeGreaterThan(hard.predictedPCorrect);
  });

  it('flags a null timeout instead of inventing an answer or a mastery transition', () => {
    const data = buildAttemptData(
      makeRecord({ selectedIndex: null, isCorrect: false, previousMastery: 0.3, newMastery: 0.3 }),
      'skill-division',
      3,
      answeredAt
    );

    expect(data.timedOut).toBe(true);
    expect(data.selectedAnswer).toBeNull();
    expect(data.isCorrect).toBe(false);
    expect(data.pMasteryBefore).toBe(data.pMasteryAfter);
    // Retained as an opportunity, without supplying answered BKT evidence.
    expect(data.opportunityIndex).toBe(3);
  });

  it('keeps the full unredacted question for analysis', () => {
    const challenge = makeChallenge({
      questionData: {
        type: 'column',
        operation: '+',
        topNumber: 47,
        bottomNumber: 25,
        placeValues: { tens: { top: 4, bottom: 2 }, ones: { top: 7, bottom: 5 } },
        answer: 72,
        hasRegrouping: true,
        answerDigits: { tens: 7, ones: 2 },
        missingPosition: 'answer',
      },
    });

    const data = buildAttemptData(makeRecord({ challenge }), 'skill-addition', 1, answeredAt);

    // The client never sees `answer`; the research table must.
    expect(data.questionData).toMatchObject({ answer: 72, topNumber: 47, bottomNumber: 25 });
  });

  it('records the exact timing policy and an explicit unused hint', () => {
    const challenge = makeChallenge({ timeLimit: 45, startedAt: 1_800_000 });
    const data = buildAttemptData(makeRecord({ challenge }), 'skill-division', 1, answeredAt);

    expect(data.questionData).toMatchObject({
      timingPolicy: {
        version: QUESTION_TIMING_POLICY_VERSION,
        timeLimitSeconds: 45,
        startedAt: 1_800_000,
        expiresAt: 1_845_000,
      },
      hintUsage: { version: 'strategy-cue-v1', requestedAt: null, timeFromStartMs: null },
    });
    expect(data.hintLevel).toBe(0);
  });

  it('records actual hint timing and correctness separately from independent mastery', () => {
    const challenge = makeChallenge({ timeLimit: 45, startedAt: 1_800_000, hintRequestedAt: 1_809_000 });
    const data = buildAttemptData(makeRecord({ challenge, newMastery: 0.3 }), 'skill-division', 2, answeredAt);

    expect(data.hintLevel).toBe(1);
    expect(data.questionData).toMatchObject({
      hintUsage: { version: 'strategy-cue-v1', requestedAt: 1_809_000, timeFromStartMs: 9_000 },
      timingPolicy: { expiresAt: 1_845_000 },
    });
    expect(data.isCorrect).toBe(true);
    expect(data.pMasteryBefore).toBe(data.pMasteryAfter);
  });

  it('never writes a row for a bot', () => {
    const state = initializeGameState('game_TEST01', BASE_PLAYERS);
    const human: PlayerState = state.players[0];
    const bot: PlayerState = state.players[1];

    // Bots are opponents, not learners — recording them would corrupt both the
    // mastery table and the evaluation data.
    expect(isRecordablePlayer(bot)).toBe(false);
    expect(isRecordablePlayer(human)).toBe(true);
  });
});
