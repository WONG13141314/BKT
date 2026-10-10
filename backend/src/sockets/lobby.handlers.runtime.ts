import type { RealtimeServer as Server, RealtimeSocket as Socket } from './realtime.types';
import type { RoomManager } from './lobby.manager';
import { defaultTimerScheduler, type TimerScheduler } from './runtime.scheduler';
import type { GameService } from '../features/game/game.runtime';
import type { GameState } from '../features/game/game.types';
import { SocketPresence } from './presence.manager';

/** A lobby seat survives a brief network interruption before it is released. */
export const LOBBY_RECONNECT_GRACE_MS = 60_000;
export interface LobbyHandlersSnapshot {
  pendingRemovals: Array<{ code: string; playerId: string; deadline: number }>;
}

export interface LobbyHandlersRuntimeOptions {
  gameService: GameService;
  roomManager: RoomManager;
  presence?: SocketPresence;
  scheduler?: TimerScheduler;
  publishGameStart: (io: Server, state: GameState) => void;
}

export function createLobbyHandlersRuntime(options: LobbyHandlersRuntimeOptions) {
  const { gameService, roomManager, publishGameStart: publishGameStartTransition } = options;
  const scheduler = options.scheduler ?? defaultTimerScheduler;
  const defaultPresence = options.presence ?? new SocketPresence();
  const pendingLobbyRemovals = new Map<string, { code: string; playerId: string; deadline: number; timer: unknown }>();
  const restoredLobbyRemovals = new Map<string, { code: string; playerId: string; deadline: number }>();

  function removalKey(code: string, playerId: string): string {
    return `${code.toUpperCase()}:${playerId}`;
  }

  function cancelPendingLobbyRemoval(code: string, playerId: string): void {
    const key = removalKey(code, playerId);
    const pending = pendingLobbyRemovals.get(key);
    if (pending) scheduler.clearTimeout(pending.timer);
    pendingLobbyRemovals.delete(key);
    restoredLobbyRemovals.delete(key);
  }


  function publishRoomAfterDeparture(io: Server, code: string): void {
    const socketRoom = `room:${code}`;
    const room = roomManager.getRoom(code);
    if (room) io.to(socketRoom).emit('room:update', roomManager.serializeRoom(room));
    else io.to(socketRoom).emit('room:deleted', { code });
  }

  function queueLobbyRemoval(
    io: Server,
    code: string,
    playerId: string,
    presence: SocketPresence = defaultPresence,
    deadline: number = Date.now() + LOBBY_RECONNECT_GRACE_MS
  ): void {
    cancelPendingLobbyRemoval(code, playerId);
    const key = removalKey(code, playerId);
    const timer = scheduler.setTimeout(() => {
      pendingLobbyRemovals.delete(key);
      const room = roomManager.getRoom(code);
      if (presence.count(playerId) > 0 || !room || room.status !== 'waiting' || !room.players.has(playerId)) return;
      roomManager.removePlayer(playerId);
      publishRoomAfterDeparture(io, code);
    }, Math.max(0, deadline - Date.now()), `disconnect:${key}`);
    pendingLobbyRemovals.set(key, { code, playerId, deadline, timer });
  }

  const registerLobbyHandlers = (
    io: Server,
    socket: Socket,
    presence: SocketPresence = defaultPresence
  ) => {
    const playerId = socket.data.player.id;
    const playerName = socket.data.player.displayName;
    const playerAvatar = socket.data.player.avatar;

    function handleLeave(): void {
      const room = roomManager.getRoomForPlayer(playerId);
      if (room) cancelPendingLobbyRemoval(room.code, playerId);

      const code = roomManager.removePlayer(playerId);
      if (!code) return;

      socket.leave(`room:${code}`);
      publishRoomAfterDeparture(io, code);
    }

    function scheduleLobbyRemoval(code: string): void {
      queueLobbyRemoval(io, code, playerId, presence);
    }

    // Host creates a new room
    socket.on('room:create', () => {
      const previousRoom = roomManager.getRoomForPlayer(playerId);
      if (previousRoom) cancelPendingLobbyRemoval(previousRoom.code, playerId);
      let room;
      try {
        room = roomManager.createRoom(playerId, playerName, playerAvatar);
      } catch (error) {
        socket.emit('room:error', { message: error instanceof Error ? error.message : 'Unable to create room.' });
        return;
      }
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
      if (room.status === 'playing') {
        const gameId = `game_${room.code}`;
        if (!gameService.getGameSync(gameId)) {
          socket.emit('room:removed', {
            code: room.code,
            message: 'This game is no longer available.',
          });
          return;
        }
        socket.data.gameId = gameId;
        socket.join(`room:${room.code}`);
        socket.emit('game:start', { roomCode: room.code });
        return;
      }
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


  return {
    register: registerLobbyHandlers,
    resume(io: Server): void {
      for (const pending of [...restoredLobbyRemovals.values()]) {
        const room = roomManager.getRoom(pending.code);
        if (defaultPresence.count(pending.playerId) > 0 || !room || room.status !== 'waiting' || !room.players.has(pending.playerId)) {
          cancelPendingLobbyRemoval(pending.code, pending.playerId);
          continue;
        }
        queueLobbyRemoval(io, pending.code, pending.playerId, defaultPresence, pending.deadline);
      }
    },
    snapshot(): LobbyHandlersSnapshot {
      const pending = new Map(restoredLobbyRemovals);
      for (const [key, value] of pendingLobbyRemovals) {
        pending.set(key, { code: value.code, playerId: value.playerId, deadline: value.deadline });
      }
      return { pendingRemovals: [...pending.values()] };
    },
    restore(snapshot: LobbyHandlersSnapshot): void {
      for (const pending of pendingLobbyRemovals.values()) scheduler.clearTimeout(pending.timer);
      pendingLobbyRemovals.clear();
      restoredLobbyRemovals.clear();
      for (const pending of snapshot.pendingRemovals) restoredLobbyRemovals.set(removalKey(pending.code, pending.playerId), { ...pending });
    },
  };
}

export type LobbyHandlersRuntime = ReturnType<typeof createLobbyHandlersRuntime>;
