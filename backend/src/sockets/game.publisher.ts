import type { Server, Socket } from 'socket.io';
import { toPublicChallenge } from '../features/game/challenge.public';
import { toPublicGameState } from '../features/game/game.public';
import type { DuelState, FinalScore, GameState, MasteryReport, PublicDuelState } from '../features/game/game.types';

function getSocketRoom(gameId: string): string {
  return `room:${gameId.replace('game_', '')}`;
}

export function toPublicDuelState(duel: DuelState): PublicDuelState {
  const side = (duelSide: DuelState['challenger']) => ({
    playerId: duelSide.playerId,
    hasAnswered: duelSide.selectedIndex !== null || duelSide.timedOut === true,
    isCorrect: duel.resolution ? duelSide.isCorrect : null,
  });

  return {
    tileIndex: duel.tileIndex,
    tileName: duel.tileName,
    rentAmount: duel.rentAmount,
    challenger: side(duel.challenger),
    owner: side(duel.owner),
    resolution: duel.resolution,
  };
}

/** Finds the sole private learning report that belongs to a socket recipient. */
export function findMasteryReportForSocket(
  socket: Socket,
  reports: MasteryReport[],
  state: GameState
): MasteryReport | null {
  const viewerId = socket.data?.player?.id;
  const seat = state.players.find((player) => player.playerId === viewerId);
  if (!seat) return null;
  return reports.find((report) =>
    report.playerId === seat.id || report.playerId === seat.playerId
  ) ?? null;
}

function isSocketPlayer(socket: Socket, playerId: string): boolean {
  const viewerId = socket.data?.player?.id;
  return viewerId === playerId;
}

function publishChallengeToSocket(socket: Socket, state: GameState): void {
  if (!state.currentChallenge) return;

  const activePlayer = state.players[state.currentPlayerIndex];
  if (!activePlayer || activePlayer.isBot) return;

  if (isSocketPlayer(socket, activePlayer.playerId)) {
    socket.emit('game:challenge', {
      challenge: toPublicChallenge(state.currentChallenge),
      playerId: activePlayer.id,
    });
    return;
  }

  socket.emit('game:challenge-started', {
    playerId: activePlayer.id,
    context: state.currentChallenge.context,
  });
}

function publishDuelToSocket(socket: Socket, state: GameState): void {
  const duel = state.duelState;
  if (!duel || duel.resolution) return;

  const challenger = state.players.find((player) => player.id === duel.challenger.playerId);
  const owner = state.players.find((player) => player.id === duel.owner.playerId);
  const mySide = challenger && isSocketPlayer(socket, challenger.playerId)
    ? duel.challenger
    : owner && isSocketPlayer(socket, owner.playerId)
      ? duel.owner
      : null;

  socket.emit('game:duel', {
    duel: toPublicDuelState(duel),
    myChallenge: mySide && mySide.selectedIndex === null && !mySide.timedOut
      ? toPublicChallenge(mySide.challenge)
      : null,
  });
}

/** Publishes the public snapshot and recipient-specific challenge/duel details. */
export function publishGameState(io: Server, state: GameState): void {
  const socketRoom = getSocketRoom(state.id);
  io.to(socketRoom).emit('game:state', { state: toPublicGameState(state) });

  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    publishChallengeToSocket(socket, state);
    publishDuelToSocket(socket, state);
  }
}

/** Restores a reconnecting socket with its room-visible and learner-private data. */
export function publishGameStateToSocket(socket: Socket, state: GameState): void {
  socket.emit('game:state', { state: toPublicGameState(state) });
  publishChallengeToSocket(socket, state);
  publishDuelToSocket(socket, state);
}

/** Restores every authoritative payload a single recipient may receive. */
export function publishGameRecoveryToSocket(
  socket: Socket,
  state: GameState,
  finished: { scores: FinalScore[] | null; masteryReport: MasteryReport | null } = {
    scores: null,
    masteryReport: null,
  }
): void {
  publishGameStateToSocket(socket, state);
  if (state.phase === 'FINISHED' && finished.scores) {
    publishFinishedToSocket(socket, state, finished.scores, finished.masteryReport);
  }
}

/** Sends the public scores and only the caller's private learning report. */
export function publishFinishedToSocket(
  socket: Socket,
  _state: GameState,
  scores: FinalScore[],
  report: MasteryReport | null
): void {
  socket.emit('game:finished', { scores, masteryReport: report });
}
