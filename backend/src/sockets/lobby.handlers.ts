import { Server, Socket } from 'socket.io';
import { roomManager } from './lobby.manager';

export const registerLobbyHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.user.id;
  const userName = socket.data.user.name;

  // Host creates a new room
  socket.on('room:create', () => {
    const room = roomManager.createRoom(userId, userName);
    const socketRoom = `room:${room.code}`;
    socket.join(socketRoom);

    socket.emit('room:created', { code: room.code });
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Player joins an existing room by code
  socket.on('room:join', (data: { code: string }) => {
    const { room, error } = roomManager.joinRoom(data.code, userId, userName);

    if (!room) {
      socket.emit('room:error', { message: error });
      return;
    }

    const socketRoom = `room:${room.code}`;
    socket.join(socketRoom);
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Toggle ready status
  socket.on('room:ready', () => {
    const code = roomManager.toggleReady(userId);
    if (!code) return;

    const room = roomManager.getRoom(code);
    if (!room) return;

    const socketRoom = `room:${room.code}`;
    io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
  });

  // Host adds a bot
  socket.on('room:add-bot', (data: { difficulty?: 'easy' | 'medium' | 'hard' }) => {
    const room = roomManager.getRoomForUser(userId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    const { room: updatedRoom, error } = roomManager.addBot(
      room.code,
      userId,
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
    const room = roomManager.getRoomForUser(userId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    const { room: updatedRoom, error } = roomManager.removeBot(
      room.code,
      userId,
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
  socket.on('room:start', () => {
    const room = roomManager.getRoomForUser(userId);
    if (!room) {
      socket.emit('room:error', { message: 'You are not in a room.' });
      return;
    }

    if (room.hostId !== userId) {
      socket.emit('room:error', { message: 'Only the host can start the game.' });
      return;
    }

    if (!roomManager.canStartGame(room.code)) {
      socket.emit('room:error', { message: 'Need at least 2 players (human or bot) and all humans must be ready.' });
      return;
    }

    roomManager.setRoomStatus(room.code, 'playing');

    const socketRoom = `room:${room.code}`;
    const gameId = `game_${room.code}`;
    const PLAYER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];
    const gamePlayers = Array.from(room.players.values()).map((p, idx) => ({
      id: p.id,
      userId: p.id,
      name: p.name,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      order: idx,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
    }));

    import('../features/game/game.service').then(({ gameService }) => {
      gameService.createGame(gameId, gamePlayers).then((state) => {
        io.to(socketRoom).emit('game:start', { roomCode: room.code });
        io.to(socketRoom).emit('game:state', { state });
      });
    });
  });

  // Player leaves the room
  socket.on('room:leave', () => {
    handleLeave();
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    handleLeave();
  });

  function handleLeave() {
    const code = roomManager.removePlayer(userId);
    if (!code) return;

    const socketRoom = `room:${code}`;
    socket.leave(socketRoom);

    const room = roomManager.getRoom(code);
    if (room) {
      io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
    } else {
      io.to(socketRoom).emit('room:deleted', { code });
    }
  }
};
