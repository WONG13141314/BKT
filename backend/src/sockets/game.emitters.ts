// ============================================
// Answer and duel result messages
// Who learns what: the answering learner sees the answer and worked maths,
// onlookers only the outcome. Pure sends with no timers or state changes.
// ============================================

import type { RealtimeServer as Server } from './realtime.types';
import type { AnswerResult, GameState } from '../features/game/game.types';
import { buildWorkedFeedback } from '../bkt/feedback';
import { toPublicDuelState } from './game.publisher';

export function emitDuelResult(io: Server, socketRoom: string, state: GameState) {
  if (!state.duelState?.resolution) return;

  io.to(socketRoom).emit('game:duel-result', {
    duel: toPublicDuelState(state.duelState),
    resolution: state.duelState.resolution,
  });
}

export function emitAnswerResult(
  io: Server,
  socketRoom: string,
  state: GameState,
  result: AnswerResult,
  challengeId?: string
) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;

    const isActivePlayer = s.data?.player?.id === activePlayer.playerId;

    // Onlookers learn the outcome, not the answer or the mastery numbers.
    const publicResult = isActivePlayer
      ? {
          isCorrect: result.isCorrect,
          correctAnswer: result.correctAnswer,
          reward: result.reward,
          streakCount: result.streakCount,
          streakBroken: result.streakBroken,
           timedOut: result.timedOut,
           assisted: result.assisted,
           feedback: result.feedback,
        }
      : { isCorrect: result.isCorrect, timedOut: result.timedOut };

    s.emit('game:answer-result', {
      result: publicResult,
      playerId: activePlayer.id,
      ...(challengeId ? { challengeId } : {}),
    });
  }
}

/** Sends reveal details only to the authenticated learner who answered a duel side. */
export function emitPrivateDuelAnswerResult(
  io: Server,
  socketRoom: string,
  state: GameState,
  seatId: string
) {
  const duel = state.duelState;
  const side = duel && [duel.challenger, duel.owner].find((candidate) => candidate.playerId === seatId);
  const learner = state.players.find((player) => player.id === seatId);
  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!side || !learner || learner.isBot || !room) return;

  const result = {
    isCorrect: side.isCorrect === true,
    correctAnswer: side.challenge.options[side.challenge.correctIndex] ?? '',
    reward: { type: 'NONE' as const, value: 0, description: 'Duel answer recorded.' },
    streakCount: learner.streak,
    streakBroken: false,
    timedOut: side.timedOut === true,
    assisted: side.challenge.hintRequestedAt !== undefined,
    feedback: buildWorkedFeedback(side.challenge),
  };

  for (const socketId of room) {
    const recipient = io.sockets.sockets.get(socketId);
    if (recipient?.data?.player?.id !== learner.playerId) continue;
    recipient.emit('game:answer-result', { result, playerId: learner.id, challengeId: side.challenge.id });
  }
}

export function emitTimedOutDuelAnswerResults(
  io: Server,
  socketRoom: string,
  state: GameState,
  exceptSeatId?: string
) {
  const duel = state.duelState;
  if (!duel?.resolution) return;
  for (const side of [duel.challenger, duel.owner]) {
    if (side.timedOut && side.playerId !== exceptSeatId) {
      emitPrivateDuelAnswerResult(io, socketRoom, state, side.playerId);
    }
  }
}
