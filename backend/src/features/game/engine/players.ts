// Shared player helpers: the active seat, hints, answer evidence and mastery updates.

import { GameState, PlayerState, AnswerResult, RewardResult, MathChallenge } from '../game.types';
import { SkillName, ANSWER_NETWORK_GRACE_MS, MAX_HINTS_PER_MATCH } from '../game.constants';
import { updateMastery } from '../../../bkt/bkt.engine';
import { getAdjustedParams, RECENT_SKILL_HISTORY_LIMIT } from '../../../bkt/bkt.selector';
import { INITIAL_MASTERY } from '../../../bkt/bkt.defaults';
import { buildWorkedFeedback } from '../../../bkt/feedback';
import { isDuelSideComplete } from './duel';

/** Get the current player */
export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

/** Get active (non-bankrupt) players */
export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.isBankrupt);
}

/** Hints a learner may still request this match. */
export function hintsRemaining(player: PlayerState): number {
  return Math.max(0, MAX_HINTS_PER_MATCH - (player.hintsUsed ?? 0));
}

/** Request exactly one private hint for a live, unanswered human challenge. */
export function requestChallengeHint(
  state: GameState,
  seatId: string,
  challengeId: string,
  requestedAt: number = Date.now()
): { newState: GameState; challenge: MathChallenge } | null {
  const player = state.players.find((candidate) => candidate.id === seatId);
  if (state.phase !== 'PLAYING' || !player || player.isBot || player.isBankrupt ||
      !Number.isFinite(requestedAt)) return null;

  const available = (challenge: MathChallenge) => challenge.id === challengeId &&
    requestedAt >= challenge.startedAt &&
    requestedAt < challenge.startedAt + challenge.timeLimit * 1_000;
  const withHint = (challenge: MathChallenge): MathChallenge => challenge.hintRequestedAt === undefined
    ? { ...challenge, hintRequestedAt: requestedAt }
    : challenge;
  // A repeated request for an already-hinted question is free; a new one needs an unused hint.
  const canStartHint = (challenge: MathChallenge) =>
    challenge.hintRequestedAt !== undefined || hintsRemaining(player) > 0;
  const countHint = (players: PlayerState[]) => players.map((seat) =>
    seat.id === seatId ? { ...seat, hintsUsed: (seat.hintsUsed ?? 0) + 1 } : seat);

  if (state.turnPhase === 'MATH_DUEL') {
    const duel = state.duelState;
    if (!duel || duel.resolution) return null;
    const sideKey = duel.challenger.playerId === seatId ? 'challenger'
      : duel.owner.playerId === seatId ? 'owner' : null;
    if (!sideKey) return null;
    const side = duel[sideKey];
    if (isDuelSideComplete(side) || !available(side.challenge) || !canStartHint(side.challenge)) return null;
    const challenge = withHint(side.challenge);
    return {
      challenge,
      newState: challenge === side.challenge ? state : {
        ...state, players: countHint(state.players), duelState: { ...duel, [sideKey]: { ...side, challenge } },
      },
    };
  }

  if (!['SMART_BUY_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE'].includes(state.turnPhase) ||
      getCurrentPlayer(state).id !== seatId || !state.currentChallenge ||
      !available(state.currentChallenge) || !canStartHint(state.currentChallenge)) return null;
  const challenge = withHint(state.currentChallenge);
  return {
    challenge,
    newState: challenge === state.currentChallenge ? state
      : { ...state, players: countHint(state.players), currentChallenge: challenge },
  };
}

/** Last moment an answer to this challenge is accepted: expiry plus network grace. */
export function answerAcceptedUntil(challenge: Pick<MathChallenge, 'startedAt' | 'timeLimit'>): number {
  return challenge.startedAt + challenge.timeLimit * 1_000 + ANSWER_NETWORK_GRACE_MS;
}

export function updatePlayerInList(
  players: PlayerState[],
  index: number,
  updater: (p: PlayerState) => PlayerState
): PlayerState[] {
  return players.map((p, i) => (i === index ? updater(p) : p));
}

const RECENT_QUESTION_FINGERPRINT_LIMIT = 8;

/** Record issuance, rather than grading, so abandoned prompts still count. */
export function rememberIssuedQuestion(player: PlayerState, challenge: MathChallenge): PlayerState {
  return {
    ...player,
    recentQuestionFingerprints: [
      ...(player.recentQuestionFingerprints ?? []),
      challenge.fingerprint,
    ].slice(-RECENT_QUESTION_FINGERPRINT_LIMIT),
    recentIssuedSkills: [
      ...(player.recentIssuedSkills ?? []),
      challenge.skillName,
    ].slice(-RECENT_SKILL_HISTORY_LIMIT),
    lastQuestionDifficulty: {
      ...player.lastQuestionDifficulty,
      [challenge.skillName]: challenge.difficulty,
    },
  };
}

export function updatePlayerMoney(state: GameState, playerIdx: number, amount: number): GameState {
  return {
    ...state,
    players: updatePlayerInList(state.players, playerIdx, (p) => ({
      ...p,
      money: p.money + amount,
    })),
  };
}

export function updatePlayerMastery(
  player: PlayerState,
  skill: SkillName,
  isCorrect: boolean,
  difficulty: 1 | 2 | 3,
  timedOut: boolean = false,
  assisted: boolean = false
): { newMastery: number; previousMastery: number } {
  const previousMastery = player.masteryStates[skill] ?? INITIAL_MASTERY;
  const params = getAdjustedParams(difficulty);
  // An autopilot answer is the bot's, not the learner's.
  const noEvidence = timedOut || assisted || player.autopilot === true;
  const newMastery = noEvidence ? previousMastery : updateMastery(previousMastery, isCorrect, params);
  return { newMastery, previousMastery };
}

/**
 * The bookkeeping every answer produces, wherever it happened. Returned as a
 * patch so callers can merge it alongside their own changes (money, position).
 *
 * Only submitted, unassisted answers supply evidence for difficulty selection.
 * Assisted correctness still earns the normal game rewards and streaks.
 */
export function applyAnswerToPlayer(
  player: PlayerState,
  skillName: string,
  isCorrect: boolean,
  newMastery: number,
  timedOut: boolean = false,
  assisted: boolean = false
): Partial<PlayerState> {
  const playedByBot = player.autopilot === true;
  const noEvidence = timedOut || assisted || playedByBot;
  // An away learner's score and streak are their own: the shown score and the
  // saved game_players totals must not include answers a bot gave for them.
  return {
    totalQuestions: player.totalQuestions + (playedByBot ? 0 : 1),
    totalCorrect: isCorrect && !playedByBot ? player.totalCorrect + 1 : player.totalCorrect,
    streak: playedByBot ? player.streak : isCorrect ? player.streak + 1 : 0,
    masteryStates: { ...player.masteryStates, [skillName]: newMastery },
    skillAttempts: {
      ...player.skillAttempts,
      [skillName]: (player.skillAttempts[skillName] ?? 0) + (noEvidence ? 0 : 1),
    },
    consecutiveFailures: {
      ...player.consecutiveFailures,
      [skillName]: noEvidence
        ? (player.consecutiveFailures[skillName] ?? 0)
        : isCorrect ? 0 : (player.consecutiveFailures[skillName] ?? 0) + 1,
    },
  };
}

export function updatePlayerAfterAnswer(
  state: GameState,
  isCorrect: boolean,
  challenge: { skillName: string; hintRequestedAt?: number },
  newMastery: number,
  timedOut: boolean = false
): PlayerState[] {
  return updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    ...applyAnswerToPlayer(p, challenge.skillName, isCorrect, newMastery, timedOut,
      challenge.hintRequestedAt !== undefined),
  }));
}

export function buildAnswerResult(
  isCorrect: boolean,
  challenge: MathChallenge,
  newMastery: number,
  previousMastery: number,
  reward: RewardResult,
  player: PlayerState,
  timedOut: boolean = false
): AnswerResult {
  return {
    isCorrect,
    correctAnswer: challenge.options[challenge.correctIndex],
    newMastery,
    previousMastery,
    reward,
    streakCount: isCorrect ? player.streak + 1 : 0,
    streakBroken: !isCorrect && player.streak > 0,
    timedOut,
    assisted: challenge.hintRequestedAt !== undefined,
    feedback: buildWorkedFeedback(challenge),
  };
}

export function answerEvidence(
  challenge: MathChallenge,
  selectedIndex: number | null,
  receivedAt: number
): { isCorrect: boolean; timedOut: boolean; timeMs: number } {
  // The accepted window is [startedAt, expiresAt + network grace): an answer
  // received exactly at the end of that window is too late.
  const timedOut = selectedIndex === null || receivedAt >= answerAcceptedUntil(challenge);
  return {
    isCorrect: !timedOut && selectedIndex === challenge.correctIndex,
    timedOut,
    timeMs: Math.max(0, receivedAt - challenge.startedAt),
  };
}
