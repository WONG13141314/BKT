// ============================================
// Game persistence — the durable half of the learner model
//
// Live match state stays in memory (`game.service.ts`). This module owns
// everything that has to outlive a match:
//
//   game start   load each human's MasteryState so BKT resumes where it stopped
//   each answer  upsert MasteryState + insert one QuestionAttempt row
//   game end     snapshot Game + GamePlayer for the match history
//
// Two rules shape the design:
//
//   1. **Nothing here may block a turn.** Neon's free tier can cold-start, and a
//      socket handler that awaits a slow write freezes the whole room. Writes are
//      queued and fire-and-forget; a database failure degrades the research log,
//      it never breaks the game.
//   2. **Write on every answer, not at game end.** Children abandon games
//      constantly. A player who quits on turn 4 still contributes 4 observations.
// ============================================

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { SKILL_NAMES, type SkillName } from './game.constants';
import { getAdjustedParams } from '../../bkt/bkt.selector';
import type { FinalScore, GameState, MathChallenge, PlayerState } from './game.types';

// `backend/.env` points at the real Neon database, and dotenv loads it in any
// process that imports the config — including `jest`. Test runs must not append
// to the research dataset, so persistence is inert under NODE_ENV=test and the
// row-building logic is exercised through the pure `buildAttemptData` below.
const PERSISTENCE_DISABLED = process.env.NODE_ENV === 'test';

// ---- Skill lookup cache ----
//
// Four immutable seed rows. Cached so the answer path never issues a lookup.
// Loaded lazily rather than required at boot: an unreachable database should
// degrade persistence, not crash-loop the whole service.

let skillIdByName: Map<string, string> | null = null;
let skillNameById: Map<string, string> | null = null;

async function loadSkillCache(): Promise<boolean> {
  const rows = await prisma.skill.findMany({ select: { id: true, name: true } });

  const byName = new Map(rows.map((r) => [r.name, r.id]));
  const missing = SKILL_NAMES.filter((name) => !byName.has(name));

  if (missing.length > 0) {
    console.error(
      `[persistence] Skill rows missing from the database: ${missing.join(', ')}.\n` +
        `             Mastery and attempts CANNOT be recorded until this is fixed.\n` +
        `             Fix with:  cd backend && npm run db:seed`
    );
    return false;
  }

  skillIdByName = byName;
  skillNameById = new Map(rows.map((r) => [r.id, r.name]));
  return true;
}

async function getSkillCache(): Promise<Map<string, string> | null> {
  if (skillIdByName) return skillIdByName;
  try {
    return (await loadSkillCache()) ? skillIdByName : null;
  } catch (err) {
    console.error('[persistence] Could not load skills:', err);
    return null;
  }
}

/**
 * Warm the skill cache at boot so a misconfigured database is reported at
 * startup rather than silently on the first answer. Never throws — see rule 1.
 */
export async function warmPersistence(): Promise<void> {
  if (PERSISTENCE_DISABLED) return;
  const ok = await getSkillCache();
  if (ok) console.log('[persistence] Skill cache loaded — mastery logging is active.');
}

// ---- Write queue ----
//
// Chained per player so two answers can never race on the same MasteryState.
// Serial per player, concurrent across players.

const writeQueues = new Map<string, Promise<unknown>>();

function enqueue(key: string, task: () => Promise<unknown>): void {
  const previous = writeQueues.get(key) ?? Promise.resolve();

  const next = previous.then(task).catch((err) => {
    console.error(`[persistence] write failed for player ${key}:`, err);
  });

  writeQueues.set(key, next);

  // Drop the entry once this task is the tail and has settled, so the map does
  // not grow for the lifetime of the process.
  void next.then(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
}

/** Wait for all queued writes to drain. Tests only — nothing in the game waits. */
export async function flushWrites(): Promise<void> {
  while (writeQueues.size > 0) {
    await Promise.all([...writeQueues.values()]);
  }
}

// ---- Game start: load priors ----

export interface PlayerPriors {
  /** skillName → stored P(L). */
  mastery: Record<string, number>;
  /** skillName → lifetime observations. Difficulty gating reads this. */
  attempts: Record<string, number>;
}

/**
 * Fetch stored mastery *and* attempt counts for the given players. A player with
 * no history yields no entry, and the engine falls back to `INITIAL_MASTERY`
 * with zero attempts.
 *
 * Attempts matter as much as mastery here: difficulty selection refuses to
 * escalate on a thin estimate, so a returning player who is loaded without their
 * history would be pushed back down to easy questions every session.
 *
 * Returns an empty map on failure — a database outage must not stop a game from
 * starting, it just means this session begins from the defaults.
 */
export async function loadMasteryPriors(
  playerIds: string[]
): Promise<Map<string, PlayerPriors>> {
  const result = new Map<string, PlayerPriors>();
  if (playerIds.length === 0 || PERSISTENCE_DISABLED) return result;

  try {
    if (!(await getSkillCache())) return result;

    const rows = await prisma.masteryState.findMany({
      where: { playerId: { in: playerIds } },
      select: { playerId: true, skillId: true, pMastery: true, attempts: true },
    });

    for (const row of rows) {
      const skillName = skillNameById?.get(row.skillId);
      if (!skillName) continue;

      const priors = result.get(row.playerId) ?? { mastery: {}, attempts: {} };
      priors.mastery[skillName] = row.pMastery;
      priors.attempts[skillName] = row.attempts;
      result.set(row.playerId, priors);
    }
  } catch (err) {
    console.error('[persistence] Could not load mastery priors:', err);
  }

  return result;
}

// ---- Each answer: record the attempt ----

export interface AttemptRecord {
  player: PlayerState;
  /** The `Game.id` this attempt belongs to — see `GameState.dbGameId`. */
  dbGameId: string;
  challenge: MathChallenge;
  selectedIndex: number;
  timeMs: number;
  previousMastery: number;
  newMastery: number;
  isCorrect: boolean;
}

/**
 * The model's own prediction, made *before* it saw the answer:
 *
 *   P(correct) = P(L)·(1 − P(S)) + (1 − P(L))·P(G)
 *
 * This is the single most important column in the table. Compared against
 * `isCorrect` across many attempts it yields the AUC/RMSE that demonstrate the
 * engine actually models the learner. It exists only at answer time — once
 * mastery updates it is unrecoverable, which is why it is written here and not
 * derived later.
 */
function predictPCorrect(pMastery: number, difficulty: 1 | 2 | 3): number {
  const { pG, pS } = getAdjustedParams(difficulty);
  return pMastery * (1 - pS) + (1 - pMastery) * pG;
}

/**
 * Queue one answer for durable storage. Returns immediately.
 *
 * Bots are skipped: they are opponents, not learners, and their answers would
 * pollute both the mastery table and the evaluation data.
 */
export function isRecordablePlayer(player: PlayerState): boolean {
  return !player.isBot;
}

export function recordAttempt(record: AttemptRecord): void {
  const { player } = record;
  if (!isRecordablePlayer(player) || PERSISTENCE_DISABLED) return;

  enqueue(player.playerId, () => writeAttempt(record));
}

/**
 * Build the exact `QuestionAttempt` row for one answer. Pure — everything except
 * `opportunityIndex` (which the database supplies) is decided here, so the shape
 * of the research data can be verified without a database.
 */
export function buildAttemptData(
  record: AttemptRecord,
  skillId: string,
  opportunityIndex: number,
  answeredAt: Date
) {
  const { player, dbGameId, challenge, selectedIndex, timeMs, previousMastery, newMastery, isCorrect } =
    record;

  return {
    playerId: player.playerId,
    skillId,
    gameId: dbGameId,
    difficulty: challenge.difficulty,
    context: challenge.context,
    // The *unredacted* question. Phase 1 keeps answers out of browsers; this is
    // a server-side research table and needs the exact item that was shown.
    questionData: challenge.questionData as unknown as Prisma.InputJsonValue,
    correctAnswer: challenge.options[challenge.correctIndex] ?? '',
    // -1 is the sentinel the server submits when a challenge deadline passes, so
    // it is exactly the set of attempts where no answer was given. Flagged
    // rather than dropped: a timeout is usually "didn't know", but sometimes it
    // is a closed laptop, and the analysis must be able to tell them apart.
    selectedAnswer: selectedIndex >= 0 ? challenge.options[selectedIndex] ?? null : null,
    isCorrect,
    timedOut: selectedIndex < 0,
    timeMs: Number.isFinite(timeMs) ? Math.max(0, Math.round(timeMs)) : null,
    hintLevel: challenge.hintLevel,
    pMasteryBefore: previousMastery,
    pMasteryAfter: newMastery,
    predictedPCorrect: predictPCorrect(previousMastery, challenge.difficulty),
    opportunityIndex,
    answeredAt,
  };
}

async function writeAttempt(record: AttemptRecord): Promise<void> {
  const { player, challenge, newMastery, isCorrect } = record;

  const skills = await getSkillCache();
  const skillId = skills?.get(challenge.skillName);
  if (!skillId) return; // Already reported loudly by loadSkillCache.

  const answeredAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Upsert first: the returned `attempts` count *is* the opportunity index,
    // which keeps the two tables consistent by construction and needs no
    // counting query. Wrapped in a transaction so mastery can never advance
    // without the attempt that caused it.
    const mastery = await tx.masteryState.upsert({
      where: { playerId_skillId: { playerId: player.playerId, skillId } },
      create: {
        playerId: player.playerId,
        skillId,
        pMastery: newMastery,
        attempts: 1,
        correct: isCorrect ? 1 : 0,
        lastPracticedAt: answeredAt,
      },
      update: {
        pMastery: newMastery,
        attempts: { increment: 1 },
        correct: isCorrect ? { increment: 1 } : undefined,
        lastPracticedAt: answeredAt,
      },
      select: { attempts: true },
    });

    await tx.questionAttempt.create({
      data: buildAttemptData(record, skillId, mastery.attempts, answeredAt),
    });
  });
}

// ---- Game end: snapshot the match ----

/** A fresh `Game.id`. Room codes are recycled, so they cannot identify a match. */
export function newGameId(): string {
  return randomUUID();
}

/**
 * Persist the finished match. Queued under the game id so a slow write cannot
 * delay the final scoreboard reaching the players.
 */
export function recordGameResult(state: GameState, scores: FinalScore[]): void {
  if (PERSISTENCE_DISABLED) return;
  enqueue(`game:${state.dbGameId}`, () => writeGameResult(state, scores));
}

async function writeGameResult(state: GameState, scores: FinalScore[]): Promise<void> {
  const rankById = new Map(scores.map((s) => [s.playerId, s]));
  const roomCode = state.id.replace(/^game_/, '');

  await prisma.game.upsert({
    where: { id: state.dbGameId },
    create: {
      id: state.dbGameId,
      roomCode,
      status: 'FINISHED',
      round: state.round,
      maxRounds: state.maxRounds,
      endedAt: new Date(),
      players: {
        create: state.players.map((player, index) => {
          const score = rankById.get(player.id);
          return {
            // Bots have no Player row — their id is a lobby-local string.
            playerId: player.isBot ? null : player.playerId,
            name: player.name,
            isBot: player.isBot,
            color: player.color,
            turnOrder: index,
            finalCash: score?.cash ?? player.money,
            finalNetWorth: score?.netWorth ?? player.money,
            rank: score?.rank ?? null,
            totalCorrect: player.totalCorrect,
            totalQuestions: player.totalQuestions,
          };
        }),
      },
    },
    update: {
      status: 'FINISHED',
      round: state.round,
      endedAt: new Date(),
    },
  });
}

export type { SkillName };
