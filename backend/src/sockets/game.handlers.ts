// Game socket handlers — real-time game flow via Socket.IO
// Bridges the lobby → game engine → client state sync

import { Server, Socket } from 'socket.io';
import { gameService } from '../features/game/game.service';
import { GameState } from '../features/game/game.types';

const PLAYER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.user.id;
  const userName = socket.data.user.name;

  /**
   * game:init — Initialize the game state after lobby starts
   * Emitted by the host after room:start
   * Data: { roomCode, players: [{ id, userId, name }] }
   */
  socket.on('game:init', async (data: {
    roomCode: string;
    players: { id: string; userId: string; name: string }[];
  }) => {
    const { roomCode, players } = data;
    const gameId = `game_${roomCode}`;
    const socketRoom = `room:${roomCode}`;

    // Assign colors and order
    const gamePlayers = players.map((p, idx) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      order: idx,
    }));

    try {
      const state = await gameService.createGame(gameId, gamePlayers);
      io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(state) });
      console.log(`🎲 Game initialized: ${gameId} with ${gamePlayers.length} players`);
    } catch (error) {
      socket.emit('game:error', { message: 'Failed to initialize game' });
    }
  });

  /**
   * game:request-state — Client requests the latest game state (useful on mount/reconnect)
   * Data: { gameId }
   */
  socket.on('game:request-state', async (data: { gameId: string }) => {
    const { gameId } = data;
    try {
      const state = await gameService.getGame(gameId);
      if (state) {
        socket.emit('game:state', { state: stripChallengeFromState(state) });
        if (state.currentChallenge) {
          const activePlayer = state.players[state.currentPlayerIndex];
          if (socket.data.user.id === activePlayer.userId) {
            socket.emit('game:challenge', {
              challenge: state.currentChallenge,
              playerId: activePlayer.id,
            });
          } else {
            socket.emit('game:challenge-started', { playerId: activePlayer.id });
          }
        }
      }
    } catch (e) {
      console.error('Error fetching state', e);
    }
  });

  /**
   * game:roll — Player requests to roll dice (triggers math challenge)
   * Data: { gameId }
   */
  socket.on('game:roll', (data: { gameId: string }) => {
    const { gameId } = data;
    const socketRoom = getSocketRoom(gameId);

    const stateCheck = gameService.getGameSync(gameId);
    if (!stateCheck) return;
    const activePlayer = stateCheck.players[stateCheck.currentPlayerIndex];
    if (activePlayer.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    const state = gameService.startRoll(gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot roll right now' });
      return;
    }

    // Send the state to everyone (stripped)
    io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(state) });

    if (state.currentChallenge) {
      const currentPlayer = state.players[state.currentPlayerIndex];
      emitChallengeToPlayer(io, socketRoom, state.currentChallenge, currentPlayer.id, currentPlayer.userId);
    }
  });

  /**
   * game:answer — Player submits an answer to a math challenge
   * Data: { gameId, selectedIndex, timeMs }
   */
  socket.on('game:answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    const { gameId, selectedIndex, timeMs } = data;
    const socketRoom = getSocketRoom(gameId);

    const stateCheck = gameService.getGameSync(gameId);
    if (!stateCheck) return;
    const activePlayerCheck = stateCheck.players[stateCheck.currentPlayerIndex];
    if (activePlayerCheck.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    const result = gameService.submitAnswer(gameId, selectedIndex, timeMs);
    if (!result) {
      socket.emit('game:error', { message: 'No active challenge' });
      return;
    }

    // Send the full answer result ONLY to the active player, and minimal to others
    const activePlayer = result.state.players[result.state.currentPlayerIndex];
    const activeUserId = activePlayer?.userId || userId;
    
    const room = io.sockets.adapter.rooms.get(socketRoom);
    if (room) {
      for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.data.user.id === activeUserId) {
          s.emit('game:answer-result', { result: result.result, playerId: activeUserId });
        } else if (s) {
          s.emit('game:answer-result', {
            result: { isCorrect: result.result.isCorrect },
            playerId: activeUserId,
          });
        }
      }
    }

    // If state moved to MOVING, auto-execute movement
    if (result.state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(gameId);
      if (movedState) {
        io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(movedState) });

        // If there's a new challenge (from tile event), broadcast it
        if (movedState.currentChallenge) {
          const currentP = movedState.players[movedState.currentPlayerIndex];
          emitChallengeToPlayer(io, socketRoom, movedState.currentChallenge, currentP.id, currentP.userId);
        }
      }
    } else {
      // Broadcast updated state (e.g., after buy property answer)
      io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(result.state) });
    }
  });

  /**
   * game:build — Player requests to build a house
   * Data: { gameId, tileIndex }
   */
  socket.on('game:build', (data: { gameId: string; tileIndex: number }) => {
    const { gameId, tileIndex } = data;
    const socketRoom = getSocketRoom(gameId);

    const stateCheck = gameService.getGameSync(gameId);
    if (!stateCheck) return;
    const activePlayer = stateCheck.players[stateCheck.currentPlayerIndex];
    if (activePlayer.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    const state = gameService.buildHouse(gameId, tileIndex);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot build here' });
      return;
    }

    io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(state) });

    if (state.currentChallenge) {
      const currentP = state.players[state.currentPlayerIndex];
      emitChallengeToPlayer(io, socketRoom, state.currentChallenge, currentP.id, currentP.userId);
    }
  });

  /**
   * game:bail — Player pays bail to leave jail
   * Data: { gameId }
   */
  socket.on('game:bail', (data: { gameId: string }) => {
    const { gameId } = data;
    const socketRoom = getSocketRoom(gameId);

    const stateCheck = gameService.getGameSync(gameId);
    if (!stateCheck) return;
    const activePlayer = stateCheck.players[stateCheck.currentPlayerIndex];
    if (activePlayer.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    const state = gameService.payBail(gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot pay bail' });
      return;
    }

    io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(state) });
  });

  /**
   * game:end-turn — Player ends their turn
   * Data: { gameId }
   */
  socket.on('game:end-turn', (data: { gameId: string }) => {
    const { gameId } = data;
    const socketRoom = getSocketRoom(gameId);

    const stateCheck = gameService.getGameSync(gameId);
    if (!stateCheck) return;
    const activePlayer = stateCheck.players[stateCheck.currentPlayerIndex];
    if (activePlayer.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    const state = gameService.endTurn(gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot end turn now' });
      return;
    }

    io.to(socketRoom).emit('game:state', { state: stripChallengeFromState(state) });

    // Check if game has ended
    if (state.phase === 'FINISHED') {
      const scores = gameService.getScores(gameId);
      if (scores) {
        io.to(socketRoom).emit('game:finished', { scores });
      }
    }
  });
};

// ---- Helpers ----

function getSocketRoom(gameId: string): string {
  // gameId format: game_ROOMCODE
  const roomCode = gameId.replace('game_', '');
  return `room:${roomCode}`;
}

function stripChallengeFromState(state: GameState): GameState {
  return { ...state, currentChallenge: null };
}

function emitChallengeToPlayer(
  io: Server,
  socketRoom: string,
  challenge: any,
  playerId: string,
  playerUserId: string
) {
  // Find all sockets in the room that belong to the active player
  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s && s.data.user.id === playerUserId) {
      // Send full challenge (with correctIndex) only to the active player
      s.emit('game:challenge', { challenge, playerId });
    } else if (s) {
      // Other players get a lightweight notification (no question data)
      s.emit('game:challenge-started', { playerId });
    }
  }
}
