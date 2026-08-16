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
    hasAnswered: duelSide.selectedIndex !== null,
    isCorrect: duel.resolution ? duelSide.isCorrect : null,
  });

  return {
    tileIndex: duel.tileIndex,
    tileName: duel.tileName,
    rentAmount: duel.rentAmount,
    challenger: side(duel.challenger),
    owner: side(duel.owner),
    expiresAt: duel.startedAt + duel.timeLimit * 1000,
    timeLimit: duel.timeLimit,
    resolution: duel.resolution,
  };
}

function isSocketPlayer(socket: Socket, playerId: string): boolean {
  const viewerId = socket.data?.player?.id;
  return viewerId === playerId;
}

function publishChallengeToSocket(socket: Socket, state: GameState): void {
  if (!state.currentChallenge) return;

  const activePlayer = state.players[state.currentPlayerIndex];
  if (!activePlayer || activePlayer.isBot) return;

  if (isSocketPlayer(socket, activePlayer.playerId) || isSocketPlayer(socket, activePlayer.id)) {
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
  const mySide = challenger && (isSocketPlayer(socket, challenger.playerId) || isSocketPlayer(socket, challenger.id))
    ? duel.challenger
    : owner && (isSocketPlayer(socket, owner.playerId) || isSocketPlayer(socket, owner.id))
      ? duel.owner
      : null;

  socket.emit('game:duel', {
    duel: toPublicDuelState(duel),
    myChallenge: mySide && mySide.selectedIndex === null ? toPublicChallenge(mySide.challenge) : null,
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

/** Sends the public scores and only the caller's private learning report. */
export function publishFinishedToSocket(
  socket: Socket,
  _state: GameState,
  scores: FinalScore[],
  report: MasteryReport | null
): void {
  socket.emit('game:finished', { scores, masteryReport: report });
}
