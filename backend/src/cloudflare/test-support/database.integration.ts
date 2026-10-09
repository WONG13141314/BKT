import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after as afterAll, before as beforeAll, beforeEach, describe, it } from 'node:test';
import { expect } from 'expect';
import { PGlite } from '@electric-sql/pglite';
import { SKILL_NAMES } from '../../features/game/game.constants';
import type { AttemptRecord } from '../../features/game/game.persistence.types';
import { makeFinishedFixture, makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import {
  CloudflareDatabase, CloudflarePersistence, type DurableAttemptEvent, type SqlExecutor,
} from '../database';

// Invoked by the Jest wrapper, outside Jest's VM. Every query runs against
// an in-memory PostgreSQL instance created here.
// Neither dotenv nor the project's database URL is imported by this suite.
describe('Cloudflare SQL against the existing PostgreSQL schema', () => {
  let postgres: PGlite;
  let executor: SqlExecutor;
  let persistence: CloudflarePersistence;
  let database: CloudflareDatabase;

  beforeAll(async () => {
    postgres = new PGlite();
    await postgres.waitReady;
    const migrationPath = resolve(
      process.cwd(), 'prisma/migrations/20260726000000_init/migration.sql',
    );
    await postgres.exec(readFileSync(migrationPath, 'utf8'));
    executor = {
      async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
        const result = await postgres.query<T>(text, values);
        return result.rows;
      },
      async transaction(statements) {
        return postgres.transaction(async (tx) => {
          const results: Record<string, unknown>[][] = [];
          for (const statement of statements) {
            const result = await tx.query<Record<string, unknown>>(statement.text, statement.values);
            results.push(result.rows);
          }
          return results;
        });
      },
    };
    persistence = new CloudflarePersistence('synthetic-unused-connection', executor);
    database = new CloudflareDatabase('synthetic-unused-connection', executor);
  }, { timeout: 30_000 });

  beforeEach(async () => {
    await postgres.exec('TRUNCATE question_attempts, mastery_states, game_players, games, players, skills CASCADE');
    for (const name of SKILL_NAMES) {
      await postgres.query('INSERT INTO skills (id, name) VALUES ($1, $2)', [`skill-${name}`, name]);
    }
    for (const id of ['db-player-1', 'db-player-2']) {
      await postgres.query('INSERT INTO players (id, "displayName") VALUES ($1, $2)', [id, id]);
    }
  });

  afterAll(async () => {
    await postgres?.close();
  });

  function event(id = 'synthetic-attempt-1', overrides: Partial<AttemptRecord> = {}): DurableAttemptEvent {
    const state = makeGameState();
    return {
      id, answeredAt: new Date().toISOString(),
      record: {
        player: state.players[0], dbGameId: state.dbGameId,
        challenge: makePrivateChallenge(), selectedIndex: 1, timeMs: 4_000,
        previousMastery: 0.4, newMastery: 0.55, isCorrect: true, ...overrides,
      },
    };
  }

  async function masteryRow() {
    const result = await postgres.query<{
      pMastery: number; attempts: number; correct: number; lastPracticedAt: Date | null;
    }>('SELECT "pMastery", attempts, correct, "lastPracticedAt" FROM mastery_states');
    return result.rows[0];
  }

  it('keeps mastery and answer evidence atomic and applies a retried event once', async () => {
    const answered = event();
    await persistence.persistAttempt(answered);
    await persistence.persistAttempt(answered);
    expect(await masteryRow()).toMatchObject({ pMastery: 0.55, attempts: 1, correct: 1 });
    const attempts = await postgres.query<{
      id: string; opportunityIndex: number; questionData: { answer: number }; selectedAnswer: string;
    }>('SELECT id, "opportunityIndex", "questionData", "selectedAnswer" FROM question_attempts');
    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows[0]).toMatchObject({ id: answered.id, opportunityIndex: 1, selectedAnswer: '2' });
    expect(attempts.rows[0].questionData.answer).toBe(2);
  });

  it('retains timeout and hinted opportunities without counting them as independent evidence', async () => {
    const first = event();
    await persistence.persistAttempt(first);
    const practiceTime = (await masteryRow()).lastPracticedAt;
    const timeout = event('synthetic-timeout', {
      selectedIndex: null, previousMastery: 0.55, newMastery: 0.55, isCorrect: false,
    });
    timeout.answeredAt = new Date(Date.now() + 1_000).toISOString();
    await persistence.persistAttempt(timeout);
    const assisted = event('synthetic-assisted', {
      challenge: makePrivateChallenge({ hintRequestedAt: 5_000 }),
      previousMastery: 0.55, newMastery: 0.55,
    });
    assisted.answeredAt = new Date(Date.now() + 2_000).toISOString();
    await persistence.persistAttempt(assisted);
    expect(await masteryRow()).toEqual({
      pMastery: 0.55, attempts: 3, correct: 1, lastPracticedAt: practiceTime,
    });
    const attempts = await postgres.query<{ opportunityIndex: number; timedOut: boolean; hintLevel: number }>(
      'SELECT "opportunityIndex", "timedOut", "hintLevel" FROM question_attempts ORDER BY "opportunityIndex"',
    );
    expect(attempts.rows).toEqual([
      { opportunityIndex: 1, timedOut: false, hintLevel: 0 },
      { opportunityIndex: 2, timedOut: true, hintLevel: 0 },
      { opportunityIndex: 3, timedOut: false, hintLevel: 1 },
    ]);
    const priors = await persistence.loadPriors(['db-player-1', 'db-player-2']);
    expect(priors.get('db-player-1')?.attempts).toEqual({ Addition: 1 });
    expect(priors.get('db-player-1')?.mastery.Addition).toBeCloseTo(0.55, 6);
    expect(priors.has('db-player-2')).toBe(false);
  });

  it('records an incorrect independent answer and advances its lifetime opportunity index', async () => {
    await persistence.persistAttempt(event());
    await persistence.persistAttempt(event('synthetic-wrong-answer', {
      selectedIndex: 0, previousMastery: 0.55, newMastery: 0.3, isCorrect: false,
    }));
    expect(await masteryRow()).toMatchObject({ pMastery: 0.3, attempts: 2, correct: 1 });
    expect((await persistence.loadPriors(['db-player-1'])).get('db-player-1')?.attempts.Addition).toBe(2);
  });

  it('does not create a practice timestamp when the first observation is a timeout', async () => {
    await persistence.persistAttempt(event('synthetic-first-timeout', {
      selectedIndex: null, newMastery: 0.4, isCorrect: false,
    }));
    expect(await masteryRow()).toEqual({ pMastery: 0.4, attempts: 1, correct: 0, lastPracticedAt: null });
    expect((await persistence.loadPriors(['db-player-1'])).get('db-player-1')?.attempts.Addition).toBe(0);
  });

  it('rolls back the whole attempt when a required identity row is absent', async () => {
    const invalid = event();
    invalid.record.player = { ...invalid.record.player, playerId: 'synthetic-missing-player' };
    await expect(persistence.persistAttempt(invalid)).rejects.toThrow();
    expect((await postgres.query('SELECT id FROM question_attempts')).rows).toHaveLength(0);
    expect((await postgres.query('SELECT id FROM mastery_states')).rows).toHaveLength(0);
  });

  it('rolls back a mastery increment if the corresponding evidence insert fails', async () => {
    await persistence.persistAttempt(event());
    const invalid = event('synthetic-invalid-evidence');
    invalid.record.challenge = {
      ...invalid.record.challenge,
      context: null as unknown as AttemptRecord['challenge']['context'],
    };
    await expect(persistence.persistAttempt(invalid)).rejects.toMatchObject({ code: '23502' });
    expect(await masteryRow()).toMatchObject({ pMastery: 0.55, attempts: 1, correct: 1 });
    expect((await postgres.query('SELECT id FROM question_attempts')).rows).toHaveLength(1);
  });

  it('reports missing seed data instead of acknowledging an unrecorded event', async () => {
    await postgres.query('DELETE FROM skills WHERE name = $1', ['Addition']);
    await expect(persistence.persistAttempt(event())).rejects.toThrow('Missing seeded skill: Addition');
    expect((await postgres.query('SELECT id FROM question_attempts')).rows).toHaveLength(0);
  });

  it('skips bot answers before issuing database writes', async () => {
    const bot = event();
    bot.record.player = { ...bot.record.player, isBot: true, playerId: 'synthetic-bot' };
    await persistence.persistAttempt(bot);
    expect((await postgres.query('SELECT id FROM question_attempts')).rows).toHaveLength(0);
    expect((await postgres.query('SELECT id FROM mastery_states')).rows).toHaveLength(0);
  });

  it('saves a finished game and bot seat idempotently without requiring a bot identity', async () => {
    const { state, scores } = makeFinishedFixture();
    state.players[1].isBot = true;
    state.players[1].playerId = 'synthetic-bot';
    const resultEvent = { state, scores, endedAt: new Date().toISOString() };
    await persistence.persistGameResult(resultEvent);
    await persistence.persistGameResult(resultEvent);
    const games = await postgres.query<{ id: string; status: string }>('SELECT id, status FROM games');
    expect(games.rows).toEqual([{ id: state.dbGameId, status: 'FINISHED' }]);
    const seats = await postgres.query<{ playerId: string | null; turnOrder: number; isBot: boolean }>(
      'SELECT "playerId", "turnOrder", "isBot" FROM game_players ORDER BY "turnOrder"',
    );
    expect(seats.rows).toEqual([
      { playerId: 'db-player-1', turnOrder: 0, isBot: false },
      { playerId: null, turnOrder: 1, isBot: true },
    ]);
  });

  it('uses the existing identity columns and unique username constraint safely', async () => {
    const guest = await database.createGuest("Ha'na", 'car');
    expect(guest).toMatchObject({ displayName: "Ha'na", role: 'PLAYER', isClaimed: false, pinHash: null });
    await database.claimPlayer(guest.id, 'hana', 'synthetic-hash');
    expect(await database.findPlayerByUsername('hana')).toMatchObject({ id: guest.id, pinHash: 'synthetic-hash' });
    await expect(database.claimPlayer('db-player-2', 'hana', 'another-hash')).rejects.toMatchObject({ code: '23505' });
    expect(await database.updateProfile(guest.id, { displayName: 'Aina' })).toMatchObject({
      id: guest.id, displayName: 'Aina', avatar: 'car', username: 'hana', isClaimed: true,
    });
    expect(await database.touchPlayer(guest.id)).toMatchObject({ id: guest.id });
    expect(await database.findPlayerById('synthetic-absent')).toBeNull();
  });
});
