// Exercise the persistence boundary against mocked delegates. The isolated
// module enables its write path only after the database import is mocked, so
// these tests cannot connect to or modify the real research database.
import { SKILL_NAMES } from '../game.constants';
import { makeGameState, makePrivateChallenge } from '../../../test/game.fixtures';
import type { AttemptRecord } from '../game.persistence';

jest.mock('../../../config/db', () => ({
  prisma: {
    skill: { findMany: jest.fn() },
    masteryState: { findMany: jest.fn() },
    questionAttempt: { groupBy: jest.fn() },
    $transaction: jest.fn(),
  },
}));

interface MockDatabase {
  skill: { findMany: jest.Mock };
  masteryState: { findMany: jest.Mock };
  questionAttempt: { groupBy: jest.Mock };
  $transaction: jest.Mock;
}

describe('Answered evidence and timeout persistence', () => {
  let persistence: typeof import('../game.persistence');
  let database: MockDatabase;
  const now = new Date('2026-10-06T10:00:00Z');
  const transaction = {
    masteryState: { upsert: jest.fn() },
    questionAttempt: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    const originalEnvironment = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      await jest.isolateModulesAsync(async () => {
        persistence = await import('../game.persistence');
        database = (await import('../../../config/db')).prisma as unknown as MockDatabase;
      });
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
    }
    database.skill.findMany.mockResolvedValue(SKILL_NAMES.map((name) => ({
      id: `skill-${name}`, name,
    })));
    transaction.masteryState.upsert.mockResolvedValue({ attempts: 12 });
    transaction.questionAttempt.create.mockResolvedValue({});
    database.$transaction.mockImplementation((write) => write(transaction));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function record(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
    const state = makeGameState();
    return {
      player: state.players[0],
      dbGameId: state.dbGameId,
      challenge: makePrivateChallenge(),
      selectedIndex: 1,
      timeMs: 4_000,
      previousMastery: 0.4,
      newMastery: 0.55,
      isCorrect: true,
      ...overrides,
    };
  }

  it('loads historical answered counts per learner and skill instead of opportunity totals', async () => {
    database.masteryState.findMany.mockResolvedValue([
      { playerId: 'db-player-1', skillId: 'skill-Addition', pMastery: 0.6, attempts: 12, lastPracticedAt: now },
      { playerId: 'db-player-1', skillId: 'skill-Division', pMastery: 0.1, attempts: 5, lastPracticedAt: null },
      { playerId: 'db-player-2', skillId: 'skill-Addition', pMastery: 0.4, attempts: 9, lastPracticedAt: now },
    ]);
    database.questionAttempt.groupBy.mockResolvedValue([
      { playerId: 'db-player-1', skillId: 'skill-Addition', _count: { _all: 7 } },
      { playerId: 'db-player-2', skillId: 'skill-Addition', _count: { _all: 3 } },
    ]);

    const priors = await persistence.loadMasteryPriors(['db-player-1', 'db-player-2']);

    expect(database.questionAttempt.groupBy).toHaveBeenCalledWith({
      by: ['playerId', 'skillId'],
      where: { playerId: { in: ['db-player-1', 'db-player-2'] }, timedOut: false, hintLevel: 0 },
      _count: { _all: true },
    });
    expect(priors.get('db-player-1')?.attempts).toEqual({ Addition: 7, Division: 0 });
    expect(priors.get('db-player-2')?.attempts).toEqual({ Addition: 3 });
    expect(priors.get('db-player-1')?.mastery.Addition).toBe(0.6);
  });

  it('retains a timeout opportunity without updating stored mastery or the last practice date', async () => {
    persistence.recordAttempt(record({ selectedIndex: null, newMastery: 0.4, isCorrect: false }));
    await persistence.flushWrites();

    const upsert = transaction.masteryState.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({
      pMastery: undefined,
      attempts: { increment: 1 },
      correct: undefined,
      lastPracticedAt: undefined,
    });
    // For a learner with no stored row, a timeout does not create a practice date.
    expect(upsert.create).toMatchObject({ pMastery: 0.4, attempts: 1, correct: 0, lastPracticedAt: null });
    expect(transaction.questionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        timedOut: true,
        selectedAnswer: null,
        pMasteryBefore: 0.4,
        pMasteryAfter: 0.4,
        opportunityIndex: 12,
        hintLevel: 0,
      }),
    });
  });

  it('updates the practice date and stored mastery when an answer supplies evidence', async () => {
    persistence.recordAttempt(record());
    await persistence.flushWrites();

    const upsert = transaction.masteryState.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({
      pMastery: 0.55,
      attempts: { increment: 1 },
      correct: { increment: 1 },
      lastPracticedAt: now,
    });
    expect(transaction.questionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ timedOut: false, opportunityIndex: 12, hintLevel: 0 }),
    });
  });

  it.each([true, false])('logs an assisted answer (%s) without changing durable mastery', async (isCorrect) => {
    const challenge = makePrivateChallenge({ hintRequestedAt: Date.now() - 2_000 });
    persistence.recordAttempt(record({ challenge, newMastery: 0.4, isCorrect }));
    await persistence.flushWrites();

    const upsert = transaction.masteryState.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({
      pMastery: undefined,
      attempts: { increment: 1 },
      correct: undefined,
      lastPracticedAt: undefined,
    });
    expect(upsert.create).toMatchObject({ pMastery: 0.4, attempts: 1, correct: 0, lastPracticedAt: null });
    expect(transaction.questionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        timedOut: false,
        isCorrect,
        hintLevel: 1,
        pMasteryBefore: 0.4,
        pMasteryAfter: 0.4,
        opportunityIndex: 12,
      }),
    });
  });
});
