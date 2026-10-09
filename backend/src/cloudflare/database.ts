import { neon } from '@neondatabase/serverless';
import { applyForgetting } from '../bkt/bkt.engine';
import { buildAttemptData, isRecordablePlayer } from '../features/game/game.persistence.shared';
import type { AttemptRecord, PlayerPriors } from '../features/game/game.persistence.types';
import type { FinalScore, GameState } from '../features/game/game.types';

export interface SqlStatement {
  text: string;
  values: unknown[];
}

/** Small injection point for isolated SQL tests; production uses Neon's HTTP driver. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
  transaction(statements: SqlStatement[]): Promise<Record<string, unknown>[][]>;
}

async function withQueryTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { return await run(controller.signal); }
  finally {
    // A completed query must not leave a JS timer preventing room hibernation.
    clearTimeout(timer);
  }
}

export function createSqlExecutor(connectionString: string): SqlExecutor {
  const sql = neon(connectionString);
  return {
    async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
      return withQueryTimeout(async (signal) => await sql.query(text, values, {
        fetchOptions: { signal },
      }) as T[]);
    },
    async transaction(statements) {
      return withQueryTimeout(async (signal) => await sql.transaction(
        statements.map(({ text, values }) => sql.query(text, values)),
        {
          isolationLevel: 'ReadCommitted',
          fetchOptions: { signal },
        },
      ));
    },
  };
}

export interface DatabasePlayer {
  id: string;
  displayName: string;
  avatar: string;
  role: string;
  isClaimed: boolean;
  username: string | null;
  pinHash: string | null;
}

const PLAYER_COLUMNS = 'id, "displayName", avatar, role, "isClaimed", username, "pinHash"';

/** Uses the existing Prisma-managed schema without generating an edge Prisma client. */
export class CloudflareDatabase {
  readonly sql: SqlExecutor;

  constructor(connectionString: string, executor?: SqlExecutor) {
    this.sql = executor ?? createSqlExecutor(connectionString);
  }

  async findPlayerById(id: string): Promise<DatabasePlayer | null> {
    const rows = await this.sql.query<DatabasePlayer>(
      `SELECT ${PLAYER_COLUMNS} FROM players WHERE id = $1`, [id],
    );
    return rows[0] ?? null;
  }

  async findPlayerByUsername(username: string): Promise<DatabasePlayer | null> {
    const rows = await this.sql.query<DatabasePlayer>(
      `SELECT ${PLAYER_COLUMNS} FROM players WHERE username = $1`, [username],
    );
    return rows[0] ?? null;
  }

  async createGuest(displayName: string, avatar: string): Promise<DatabasePlayer> {
    const rows = await this.sql.query<DatabasePlayer>(
      `INSERT INTO players (id, "displayName", avatar) VALUES ($1, $2, $3)
       RETURNING ${PLAYER_COLUMNS}`, [crypto.randomUUID(), displayName, avatar],
    );
    return rows[0];
  }

  async touchPlayer(id: string): Promise<DatabasePlayer | null> {
    const rows = await this.sql.query<DatabasePlayer>(
      `UPDATE players SET "lastSeenAt" = CURRENT_TIMESTAMP WHERE id = $1
       RETURNING ${PLAYER_COLUMNS}`, [id],
    );
    return rows[0] ?? null;
  }

  async claimPlayer(id: string, username: string, pinHash: string): Promise<DatabasePlayer | null> {
    const rows = await this.sql.query<DatabasePlayer>(
      `UPDATE players SET username = $2, "pinHash" = $3, "isClaimed" = true
       WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`, [id, username, pinHash],
    );
    return rows[0] ?? null;
  }

  async updateProfile(
    id: string, data: { displayName?: string; avatar?: string },
  ): Promise<DatabasePlayer | null> {
    const rows = await this.sql.query<DatabasePlayer>(
      `UPDATE players SET "displayName" = COALESCE($2::text, "displayName"),
         avatar = COALESCE($3::text, avatar)
       WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
      [id, data.displayName ?? null, data.avatar ?? null],
    );
    return rows[0] ?? null;
  }
}

export interface DurableAttemptEvent {
  /** Stable across outbox retries; also the existing question_attempts primary key. */
  id: string;
  record: AttemptRecord;
  answeredAt: string;
}

export interface DurableGameResultEvent {
  state: GameState;
  scores: FinalScore[];
  endedAt: string;
}

export class CloudflarePersistence {
  readonly sql: SqlExecutor;

  constructor(connectionString: string, executor?: SqlExecutor) {
    this.sql = executor ?? createSqlExecutor(connectionString);
  }

  async loadPriors(playerIds: string[]): Promise<Map<string, PlayerPriors>> {
    const result = new Map<string, PlayerPriors>();
    if (playerIds.length === 0) return result;
    const rows = await this.sql.query<{
      playerId: string; skillName: string; pMastery: number;
      lastPracticedAt: Date | string | null; independentAttempts: number | string;
    }>(
      `SELECT m."playerId", s.name AS "skillName", m."pMastery",
         m."lastPracticedAt" AT TIME ZONE 'UTC' AS "lastPracticedAt",
         (SELECT count(*) FROM question_attempts a
          WHERE a."playerId" = m."playerId" AND a."skillId" = m."skillId"
            AND a."timedOut" = false AND a."hintLevel" = 0) AS "independentAttempts"
       FROM mastery_states m JOIN skills s ON s.id = m."skillId"
       WHERE m."playerId" = ANY($1::text[])`, [playerIds],
    );
    const now = new Date();
    for (const row of rows) {
      const priors = result.get(row.playerId) ?? { mastery: {}, attempts: {} };
      priors.mastery[row.skillName] = applyForgetting(
        row.pMastery, row.lastPracticedAt ? new Date(row.lastPracticedAt) : null, now,
      );
      priors.attempts[row.skillName] = Number(row.independentAttempts);
      result.set(row.playerId, priors);
    }
    return result;
  }

  async persistAttempt(event: DurableAttemptEvent): Promise<void> {
    const { record, id } = event;
    if (!isRecordablePlayer(record.player)) return;
    const answeredAt = new Date(event.answeredAt);
    if (!Number.isFinite(answeredAt.getTime())) throw new Error('Invalid attempt receipt time');
    const data = buildAttemptData(record, '', 0, answeredAt);
    const hasEvidence = !data.timedOut && data.hintLevel === 0;

    // Lock and write are separate statements in one ReadCommitted transaction.
    // The second statement gets a fresh snapshot after any concurrent retry
    // releases the lock. Checking the attempt id gates BOTH the evidence row
    // and the mastery increment, including a retry after a lost HTTP response.
    const results = await this.sql.transaction([
      {
        text: 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        values: [`monomath:player:${record.player.playerId}`],
      },
      {
        text: `WITH skill AS (
          SELECT id FROM skills WHERE name = $3
        ), updated_mastery AS (
          INSERT INTO mastery_states
            (id, "playerId", "skillId", "pMastery", attempts, correct,
             "lastPracticedAt", "updatedAt")
          SELECT $4, $2, skill.id, $5, 1, $6, $7::timestamp, $8::timestamp FROM skill
          WHERE NOT EXISTS (SELECT 1 FROM question_attempts WHERE id = $1)
          ON CONFLICT ("playerId", "skillId") DO UPDATE SET
            "pMastery" = CASE WHEN $9::boolean THEN EXCLUDED."pMastery"
              ELSE mastery_states."pMastery" END,
            attempts = mastery_states.attempts + 1,
            correct = mastery_states.correct + EXCLUDED.correct,
            "lastPracticedAt" = CASE WHEN $9::boolean THEN EXCLUDED."lastPracticedAt"
              ELSE mastery_states."lastPracticedAt" END,
            "updatedAt" = EXCLUDED."updatedAt"
          RETURNING "skillId", attempts
        ), inserted_attempt AS (
          INSERT INTO question_attempts
            (id, "playerId", "skillId", "gameId", difficulty, context,
             "questionData", "correctAnswer", "selectedAnswer", "isCorrect",
             "timedOut", "timeMs", "hintLevel", "pMasteryBefore", "pMasteryAfter",
             "predictedPCorrect", "opportunityIndex", "answeredAt")
          SELECT $1, $2, m."skillId", $10, $11, $12, $13::jsonb, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, m.attempts, $8::timestamp
          FROM updated_mastery m RETURNING id
        )
        SELECT EXISTS (SELECT 1 FROM skill) AS "skillExists",
          EXISTS (SELECT 1 FROM inserted_attempt) AS inserted`,
        values: [
          id, data.playerId, record.challenge.skillName, crypto.randomUUID(),
          hasEvidence ? record.newMastery : record.previousMastery,
          hasEvidence && record.isCorrect ? 1 : 0,
          hasEvidence ? answeredAt.toISOString() : null, answeredAt.toISOString(), hasEvidence,
          data.gameId, data.difficulty, data.context, JSON.stringify(data.questionData),
          data.correctAnswer, data.selectedAnswer, data.isCorrect, data.timedOut,
          data.timeMs, data.hintLevel, data.pMasteryBefore, data.pMasteryAfter,
          data.predictedPCorrect,
        ],
      },
    ]);
    if (results[1]?.[0]?.skillExists !== true) {
      throw new Error(`Missing seeded skill: ${record.challenge.skillName}`);
    }
  }

  async persistGameResult(event: DurableGameResultEvent): Promise<void> {
    const { state, scores } = event;
    const endedAt = new Date(event.endedAt);
    if (!Number.isFinite(endedAt.getTime())) throw new Error('Invalid game end time');
    const rankById = new Map(scores.map((score) => [score.playerId, score]));
    const statements: SqlStatement[] = [{
      text: `INSERT INTO games (id, "roomCode", status, round, "maxRounds", "createdAt", "endedAt")
        VALUES ($1, $2, 'FINISHED', $3, $4, $5::timestamp, $6::timestamp)
        ON CONFLICT (id) DO UPDATE SET status = 'FINISHED', round = EXCLUDED.round,
          "endedAt" = EXCLUDED."endedAt"`,
      values: [state.dbGameId, state.id.replace(/^game_/, ''), state.round, state.maxRounds,
        new Date(state.gameStartTime).toISOString(), endedAt.toISOString()],
    }];
    for (const [index, player] of state.players.entries()) {
      const score = rankById.get(player.id);
      statements.push({
        text: `INSERT INTO game_players
          (id, "gameId", "playerId", name, "isBot", color, "turnOrder", "finalCash",
           "finalNetWorth", rank, "totalCorrect", "totalQuestions")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT ("gameId", "turnOrder") DO UPDATE SET
            "playerId" = EXCLUDED."playerId", name = EXCLUDED.name, "isBot" = EXCLUDED."isBot",
            color = EXCLUDED.color, "finalCash" = EXCLUDED."finalCash",
            "finalNetWorth" = EXCLUDED."finalNetWorth", rank = EXCLUDED.rank,
            "totalCorrect" = EXCLUDED."totalCorrect", "totalQuestions" = EXCLUDED."totalQuestions"`,
        values: [crypto.randomUUID(), state.dbGameId, player.isBot ? null : player.playerId,
          player.name, player.isBot, player.color, index, score?.cash ?? player.money,
          score?.netWorth ?? player.money, score?.rank ?? null,
          player.totalCorrect, player.totalQuestions],
      });
    }
    await this.sql.transaction(statements);
  }
}
