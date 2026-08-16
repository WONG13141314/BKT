import { Server, Socket } from 'socket.io';
import { roomManager } from './lobby.manager';
import { gameService } from '../features/game/game.service';
import { publishGameStartTransition } from './game.handlers';
import { SocketPresence } from './presence.manager';

/** A lobby seat survives a brief network interruption before it is released. */
export const LOBBY_RECONNECT_GRACE_MS = 60_000;
const pendingLobbyRemovals = new Map<string, NodeJS.Timeout>();

function removalKey(code: string, playerId: string): string {
  return `${code.toUpperCase()}:${playerId}`;
}

function cancelPendingLobbyRemoval(code: string, playerId: string): void {
  const key = removalKey(code, playerId);
  const timer = pendingLobbyRemovals.get(key);
  if (!timer) return;
  clearTimeout(timer);
  pendingLobbyRemovals.delete(key);
}

export const registerLobbyHandlers = (
  io: Server,
  socket: Socket,
  presence: SocketPresence = new SocketPresence()
) => {
  const playerId = socket.data.player.id;
  const playerName = socket.data.player.displayName;
  const playerAvatar = socket.data.player.avatar;

  function publishRoomAfterDeparture(code: string): void {
    const socketRoom = `room:${code}`;
    const room = roomManager.getRoom(code);
    if (room) {
      io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
    } else {
      io.to(socketRoom).emit('room:deleted', { code });
    }
  }

  function handleLeave(): void {
    const room = roomManager.getRoomForPlayer(playerId);
    if (room) cancelPendingLobbyRemoval(room.code, playerId);

    const code = roomManager.removePlayer(playerId);
    if (!code) return;

    socket.leave(`room:${code}`);
    publishRoomAfterDeparture(code);
  }

  function scheduleLobbyRemoval(code: string): void {
    cancelPendingLobbyRemoval(code, playerId);
    const key = removalKey(code, playerId);
    const timer = setTimeout(() => {
      pendingLobbyRemovals.delete(key);
      const room = roomManager.getRoom(code);
      // A game that started during the grace window owns the roster now.
      if (!room || room.status !== 'waiting' || !room.players.has(playerId)) return;

      roomManager.removePlayer(playerId);
      publishRoomAfterDeparture(code);
    }, LOBBY_RECONNECT_GRACE_MS);
    pendingLobbyRemovals.set(key, timer);
  }

  // Host creates a new room
  socket.on('room:create', () => {
    const previousRoom = roomManager.getRoomForPlayer(playerId);
    if (previousRoom) cancelPendingLobbyRemoval(previousRoom.code, playerId);
    const room = roomManager.createRoom(playerId, playerName, playerAvatar);
    const socketRoom = `room:${room.code}`;
    socket.join(socketRoom);

    socket.emit('room:created', { code: room.code });
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Player joins an existing room by code
  socket.on('room:join', (data: { code: string }) => {
    const previousRoom = roomManager.getRoomForPlayer(playerId);
    if (previousRoom) cancelPendingLobbyRemoval(previousRoom.code, playerId);
    const { room, error } = roomManager.joinRoom(data.code, playerId, playerName, playerAvatar);

    if (!room) {
      socket.emit('room:error', { message: error });
      return;
    }

    const socketRoom = `room:${room.code}`;
    socket.join(socketRoom);
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Reconnect before the lobby grace window expires. The player keeps the same
  // ready state and host ownership; this is not a fresh join.
  socket.on('room:resume', (data: { code: string }) => {
    const code = typeof data?.code === 'string' ? data.code.toUpperCase() : '';
    const room = roomManager.getRoom(code);
    if (!room || !room.players.has(playerId)) {
      socket.emit('room:removed', {
        code,
        message: 'Your place in this room is no longer available.',
      });
      return;
    }

    cancelPendingLobbyRemoval(room.code, playerId);
    socket.join(`room:${room.code}`);
    socket.emit('room:update', roomManager.serializeRoom(room));
  });

  // Toggle ready status
  socket.on('room:ready', () => {
    const code = roomManager.toggleReady(playerId);
    if (!code) return;

    const room = roomManager.getRoom(code);
    if (!room) return;

    const socketRoom = `room:${room.code}`;
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Host adds a bot
  socket.on('room:add-bot', (data: { difficulty?: 'easy' | 'medium' | 'hard' }) => {
    const room = roomManager.getRoomForPlayer(playerId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    const { room: updatedRoom, error } = roomManager.addBot(
      room.code,
      playerId,
      data.difficulty ?? 'medium'
    );

    if (!updatedRoom) {
      socket.emit('room:error', { message: error });
      return;
    }

    const socketRoom = `room:${updatedRoom.code}`;
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(updatedRoom));
  });

  // Host removes a bot
  socket.on('room:remove-bot', (data: { botId: string }) => {
    const room = roomManager.getRoomForPlayer(playerId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    const { room: updatedRoom, error } = roomManager.removeBot(
      room.code,
      playerId,
      data.botId
    );

    if (!updatedRoom) {
      socket.emit('room:error', { message: error });
      return;
    }

    const socketRoom = `room:${updatedRoom.code}`;
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(updatedRoom));
  });

  // Host starts the game
  socket.on('room:start', async () => {
    const room = roomManager.getRoomForPlayer(playerId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    if (room.hostId !== playerId) {
      socket.emit('room:error', { message: 'Only the host can start the game.' });
      return;
    }

    if (!roomManager.canStartGame(room.code)) {
      socket.emit('room:error', { message: 'Need at least 2 players (human or bot) and all humans must be ready.' });
      return;
    }

    const startingRoom = roomManager.beginStart(room.code, playerId);
    if (!startingRoom) return;

    const socketRoom = `room:${startingRoom.code}`;
    const gameId = `game_${startingRoom.code}`;
    const PLAYER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];
    const PLAYER_TOKENS = ['race_car', 'battleship', 'top_hat', 'scottie_dog'] as const;
    const gamePlayers = Array.from(startingRoom.players.values()).map((p, idx) => ({
      id: p.id,
      playerId: p.id,
      name: p.name,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      tokenType: PLAYER_TOKENS[idx % PLAYER_TOKENS.length],
      order: idx,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
    }));

    const hasReservedRoster = () => {
      const currentRoom = roomManager.getRoom(startingRoom.code);
      return currentRoom?.status === 'starting' &&
        currentRoom.players.size === gamePlayers.length &&
        gamePlayers.every((player) => currentRoom.players.has(player.id));
    };

    try {
      const state = await gameService.createGame(gameId, gamePlayers);
      if (!hasReservedRoster()) {
        gameService.removeGame(gameId);
        roomManager.cancelStart(startingRoom.code);
        return;
      }

      const socketIds = io.sockets.adapter.rooms.get(socketRoom);
      for (const socketId of socketIds ?? []) {
        const roomSocket = io.sockets.sockets.get(socketId);
        if (roomSocket) roomSocket.data.gameId = gameId;
      }

      publishGameStartTransition(io, state);
      io.to(socketRoom).emit('game:start', { roomCode: startingRoom.code });
      roomManager.setRoomStatus(startingRoom.code, 'playing');
    } catch {
      roomManager.cancelStart(startingRoom.code);
      socket.emit('room:error', { message: 'Unable to start the game. Please try again.' });
    }
  });

  // Player leaves the room
  socket.on('room:leave', () => {
    handleLeave();
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    if (presence.disconnect(playerId, socket.id) !== 0) return;

    const room = roomManager.getRoomForPlayer(playerId);
    if (!room || room.status === 'playing') return;
    if (room.status === 'starting') {
      handleLeave();
      return;
    }
    scheduleLobbyRemoval(room.code);
  });
};
