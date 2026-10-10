// Runtime-independent research row construction for the Cloudflare game runtime.
import { QUESTION_TIMING_POLICY_VERSION } from './game.constants';
import { getAdjustedParams } from '../../bkt/bkt.selector';
import { predictCorrectProbability } from '../../bkt/bkt.engine';
import type { PlayerState } from './game.types';
import type { AttemptRecord } from './game.persistence.types';

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
  return predictCorrectProbability(pMastery, getAdjustedParams(difficulty));
}


export function isRecordablePlayer(player: PlayerState): boolean {
  return !player.isBot;
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
    questionData: {
      ...challenge.questionData,
      timingPolicy: {
        version: QUESTION_TIMING_POLICY_VERSION,
        timeLimitSeconds: challenge.timeLimit,
        startedAt: challenge.startedAt,
        expiresAt: challenge.startedAt + challenge.timeLimit * 1_000,
      },
      hintUsage: {
        version: 'strategy-cue-v1',
        requestedAt: challenge.hintRequestedAt ?? null,
        timeFromStartMs: challenge.hintRequestedAt === undefined
          ? null : Math.max(0, challenge.hintRequestedAt - challenge.startedAt),
      },
    },
    correctAnswer: challenge.options[challenge.correctIndex] ?? '',
    // Null is explicit no-answer evidence. Flag it rather than dropping it: a
    // timeout is often "didn't know", but can also be a closed laptop.
    selectedAnswer: selectedIndex === null ? null : challenge.options[selectedIndex] ?? null,
    isCorrect,
    timedOut: selectedIndex === null,
    timeMs: Number.isFinite(timeMs) ? Math.max(0, Math.round(timeMs)) : null,
    // One voluntary cue. Zero means no help was requested for this attempt.
    hintLevel: challenge.hintRequestedAt === undefined ? 0 : 1,
    pMasteryBefore: previousMastery,
    pMasteryAfter: newMastery,
    predictedPCorrect: predictPCorrect(previousMastery, challenge.difficulty),
    opportunityIndex,
    answeredAt,
  };
}
