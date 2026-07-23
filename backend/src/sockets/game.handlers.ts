// ============================================
// Game Socket Handlers — MathOpoly Redesign
// New turn flow: Roll → Dice Challenge → Move → Resolve → Buy/Rent/Card/Jail → Level Up → End
// Bot auto-turn support
// ============================================

import { Server, Socket } from 'socket.io';
import { gameService } from '../features/game/game.service';
import { GameState } from '../features/game/game.types';
import { getCurrentPlayer } from '../features/game/game.engine';

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.user.id;

  // ---- Helper: get socket room from gameId ----
  function getSocketRoom(gameId: string): string {
    const roomCode = gameId.replace('game_', '');
    return `room:${roomCode}`;
  }

  // ---- Helper: strip challenge from state (don't leak answers) ----
  function stripChallenge(state: GameState): GameState {
    return { ...state, currentChallenge: null };
  }

  // ---- Helper: send challenge only to active player ----
  function emitChallengeToPlayer(
    socketRoom: string,
    state: GameState
  ) {
    if (!state.currentChallenge) return;
    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.isBot) return; // Bots don't get challenges sent to devices

    const room = io.sockets.adapter.rooms.get(socketRoom);
    if (!room) return;

    for (const socketId of room) {
      const s = io.sockets.sockets.get(socketId);
      if (s && s.data.user.id === activePlayer.userId) {
        s.emit('game:challenge', {
          challenge: state.currentChallenge,
          playerId: activePlayer.id,
        });
      } else if (s) {
        s.emit('game:challenge-started', {
          playerId: activePlayer.id,
          skillName: state.currentChallenge.skillName,
          context: state.currentChallenge.context,
        });
      }
    }
  }

  // ---- Helper: broadcast state + check for challenges ----
  function broadcastState(socketRoom: string, state: GameState) {
    io.to(socketRoom).emit('game:state', { state: stripChallenge(state) });
    emitChallengeToPlayer(socketRoom, state);
  }

  // ---- Helper: check game over ----
  function checkAndEmitGameOver(socketRoom: string, state: GameState) {
    if (state.phase === 'FINISHED') {
      const scores = gameService.getScores(state.id);
      const reports = gameService.getMasteryReports(state.id);
      if (scores) {
        io.to(socketRoom).emit('game:finished', { scores, masteryReports: reports });
      }
    }
  }

  // ---- Helper: validate it's the player's turn ----
  function validateTurn(gameId: string): GameState | null {
    const state = gameService.getGameSync(gameId);
    if (!state) return null;
    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.userId !== userId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return null;
    }
    return state;
  }

  // ---- Helper: execute bot turns if next player is a bot ----
  async function triggerBotTurnIfNeeded(gameId: string, socketRoom: string) {
    const state = gameService.getGameSync(gameId);
    if (!state || state.phase === 'FINISHED') return;

    const currentPlayer = getCurrentPlayer(state);
    if (!currentPlayer.isBot) return;

    const steps = gameService.executeBotTurn(gameId);
    if (!steps || steps.length === 0) return;

    // Emit each bot step with delays
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, step.delay));
      io.to(socketRoom).emit('game:state', { state: stripChallenge(step.state) });
      io.to(socketRoom).emit('game:bot-action', {
        botId: currentPlayer.id,
        botName: currentPlayer.name,
        action: step.action,
      });
    }

    // Check if game ended
    const finalState = gameService.getGameSync(gameId);
    if (finalState) {
      checkAndEmitGameOver(socketRoom, finalState);
      // Chain: if next player is also a bot, continue
      if (finalState.phase === 'PLAYING') {
        await triggerBotTurnIfNeeded(gameId, socketRoom);
      }
    }
  }

  // ============================================
  // GAME EVENTS
  // ============================================

  // ---- Request current state (reconnect) ----
  socket.on('game:request-state', async (data: { gameId: string }) => {
    const state = await gameService.getGame(data.gameId);
    if (state) {
      broadcastState(getSocketRoom(data.gameId), state);
    }
  });

  // ---- ROLL: Player rolls dice ----
  socket.on('game:roll', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.startRoll(data.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot roll right now' });
      return;
    }

    broadcastState(socketRoom, state);

    // If MOVING phase (no dice challenge), auto-execute move
    if (state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(data.gameId);
      if (movedState) {
        broadcastState(socketRoom, movedState);
      }
    }
  });

  // ---- DICE CHALLENGE: Answer the dice mini-question ----
  socket.on('game:dice-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitDiceChallengeAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) {
      socket.emit('game:error', { message: 'No active dice challenge' });
      return;
    }

    emitAnswerResult(socketRoom, result.state, result.result);

    // Auto-execute move after dice challenge
    if (result.state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(data.gameId);
      if (movedState) {
        broadcastState(socketRoom, movedState);
      }
    }
  });

  // ---- BUY: Full price ----
  socket.on('game:buy-full', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.buyFull(data.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot buy right now' });
      return;
    }

    broadcastState(socketRoom, state);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- BUY: Smart Buy (start challenge) ----
  socket.on('game:smart-buy', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.startSmartBuy(data.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot Smart Buy right now' });
      return;
    }

    broadcastState(socketRoom, state);
  });

  // ---- BUY: Smart Buy answer ----
  socket.on('game:smart-buy-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitSmartBuyAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) {
      socket.emit('game:error', { message: 'No active Smart Buy challenge' });
      return;
    }

    emitAnswerResult(socketRoom, result.state, result.result);
    broadcastState(socketRoom, result.state);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- BUY: Skip ----
  socket.on('game:skip-buy', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.skipBuy(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- RENT: Pay full ----
  socket.on('game:pay-rent', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.payRent(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- RENT: Defend (start challenge) ----
  socket.on('game:rent-defense', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.startRentDefense(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
    }
  });

  // ---- RENT: Defense answer ----
  socket.on('game:rent-defense-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitRentDefenseAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) return;

    emitAnswerResult(socketRoom, result.state, result.result);
    broadcastState(socketRoom, result.state);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- CARD: Acknowledge luck card ----
  socket.on('game:card-ack', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.acknowledgeCard(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- CARD: Math challenge answer ----
  socket.on('game:card-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitCardAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) return;

    emitAnswerResult(socketRoom, result.state, result.result);
    broadcastState(socketRoom, result.state);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- JAIL: Math escape ----
  socket.on('game:jail-math', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.jailMathEscape(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
    }
  });

  // ---- JAIL: Math answer ----
  socket.on('game:jail-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitJailAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) return;

    emitAnswerResult(socketRoom, result.state, result.result);

    // If freed (MOVING), auto-execute move
    if (result.state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(data.gameId);
      if (movedState) {
        broadcastState(socketRoom, movedState);
        // Auto-advance if resolved tile goes straight to END_TURN (e.g. GO_TO_JAIL, GO, REST, TAX)
        if (movedState.turnPhase === 'END_TURN') {
          handleEndTurnFlow(data.gameId, socketRoom);
        }
      }
    } else {
      broadcastState(socketRoom, result.state);
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- JAIL: Pay bail ----
  socket.on('game:jail-bail', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.payBail(data.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot pay bail' });
      return;
    }

    broadcastState(socketRoom, state);

    // Freed — auto-execute move
    if (state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(data.gameId);
      if (movedState) {
        broadcastState(socketRoom, movedState);
        // Auto-advance if resolved tile goes straight to END_TURN
        if (movedState.turnPhase === 'END_TURN') {
          handleEndTurnFlow(data.gameId, socketRoom);
        }
      }
    }
  });

  // ---- JAIL: Wait ----
  socket.on('game:jail-wait', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.waitInJail(data.gameId);
    if (!state) return;

    broadcastState(socketRoom, state);

    // If auto-released (MOVING), auto-execute move
    if (state.turnPhase === 'MOVING') {
      const movedState = gameService.executeMove(data.gameId);
      if (movedState) {
        broadcastState(socketRoom, movedState);
        // Auto-advance if resolved tile goes straight to END_TURN
        if (movedState.turnPhase === 'END_TURN') {
          handleEndTurnFlow(data.gameId, socketRoom);
        }
      }
    } else {
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- LEVEL UP: Accept ----
  socket.on('game:level-up', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.startLevelUp(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
    }
  });

  // ---- LEVEL UP: Answer ----
  socket.on('game:level-up-answer', (data: { gameId: string; selectedIndex: number; timeMs: number }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const result = gameService.submitLevelUpAnswer(data.gameId, data.selectedIndex, data.timeMs);
    if (!result) return;

    emitAnswerResult(socketRoom, result.state, result.result);
    broadcastState(socketRoom, result.state);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- LEVEL UP: Decline ----
  socket.on('game:level-up-decline', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);

    const state = gameService.declineLevelUp(data.gameId);
    if (state) {
      broadcastState(socketRoom, state);
      handleEndTurnFlow(data.gameId, socketRoom);
    }
  });

  // ---- END TURN ----
  socket.on('game:end-turn', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;
    const socketRoom = getSocketRoom(data.gameId);
    handleEndTurnFlow(data.gameId, socketRoom);
  });

  // ---- Helper: handle end-turn flow + bot chain ----
  async function handleEndTurnFlow(gameId: string, socketRoom: string) {
    const currentState = gameService.getGameSync(gameId);
    if (!currentState) return;

    if (currentState.turnPhase === 'END_TURN') {
      const state = gameService.endTurn(gameId);
      if (!state) return;

      broadcastState(socketRoom, state);
      checkAndEmitGameOver(socketRoom, state);

      // If next player is a bot, auto-execute their turn
      if (state.phase === 'PLAYING') {
        await triggerBotTurnIfNeeded(gameId, socketRoom);
      }
    }
  }

  // ---- Helper: emit answer result to active player, minimal to others ----
  function emitAnswerResult(socketRoom: string, state: GameState, result: any) {
    const activePlayer = state.players[state.currentPlayerIndex];
    const room = io.sockets.adapter.rooms.get(socketRoom);
    if (!room) return;

    for (const socketId of room) {
      const s = io.sockets.sockets.get(socketId);
      if (s && s.data.user.id === activePlayer.userId) {
        s.emit('game:answer-result', { result, playerId: activePlayer.id });
      } else if (s) {
        s.emit('game:answer-result', {
          result: { isCorrect: result.isCorrect },
          playerId: activePlayer.id,
        });
      }
    }
  }
};
