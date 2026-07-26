// ============================================
// Game Socket Handlers
// Turn flow: Roll Challenge → Move → Resolve → Buy/Duel/Card/Jail → Level Up → End
//
// Two invariants this layer is responsible for:
//   1. No answer ever reaches a client. State broadcasts drop `currentChallenge`
//      entirely; the active player gets the redacted `PublicMathChallenge`.
//   2. No turn can wedge the room. Every phase that waits on a human is backed
//      by a server-side deadline that resolves it if they never respond.
// ============================================

import { Server, Socket } from 'socket.io';
import { gameService } from '../features/game/game.service';
import { AnswerResult, DuelState, GameState, PublicDuelState } from '../features/game/game.types';
import { toPublicChallenge } from '../features/game/challenge.public';
import { getCurrentPlayer } from '../features/game/game.engine';
import { recordGameResult } from '../features/game/game.persistence';

// ---- Deadlines ----

/** How long a player may sit on a decision (buy, jail, level up, end turn). */
const DECISION_TIMEOUT_MS = 45_000;
/** Slack on top of a challenge's own time limit, to cover latency. */
const CHALLENGE_GRACE_MS = 3_000;
/** Reconnect window before a disconnected player's turn is auto-resolved. */
const DISCONNECT_GRACE_MS = 10_000;
/** How long a finished game stays in memory so late joiners can read the scores. */
const FINISHED_GAME_TTL_MS = 5 * 60_000;

// Module scope: these outlive any single socket.
const phaseTimers = new Map<string, NodeJS.Timeout>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

// ---- Room / payload helpers ----

function getSocketRoom(gameId: string): string {
  return `room:${gameId.replace('game_', '')}`;
}

/**
 * Challenges hold answers, so they never travel with the state — neither the
 * active challenge nor either side of a duel. The duel is re-sent separately,
 * redacted per recipient.
 */
function toPublicState(state: GameState): GameState {
  return { ...state, currentChallenge: null, duelState: null };
}

/**
 * Duel status without either question. During the duel a player learns only
 * whether their opponent has answered — not what they were asked. Seeing an
 * easier-looking question opposite reads as unfair even when both are correctly
 * calibrated, so the questions are only ever revealed after the result.
 */
function toPublicDuel(duel: DuelState): PublicDuelState {
  const side = (s: DuelState['challenger']) => ({
    playerId: s.playerId,
    hasAnswered: s.selectedIndex !== null,
    isCorrect: duel.resolution ? s.isCorrect : null,
  });

  return {
    tileIndex: duel.tileIndex,
    tileName: duel.tileName,
    skillName: duel.skillName,
    rentAmount: duel.rentAmount,
    challenger: side(duel.challenger),
    owner: side(duel.owner),
    expiresAt: duel.startedAt + duel.timeLimit * 1000,
    timeLimit: duel.timeLimit,
    resolution: duel.resolution,
  };
}

/**
 * Send the duel to the room: each duellist gets their own redacted question,
 * everyone else watches the scoreboard half of the card.
 */
function emitDuel(io: Server, socketRoom: string, state: GameState) {
  const duel = state.duelState;
  if (!duel) return;

  const publicDuel = toPublicDuel(duel);
  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;

    const viewerId = s.data?.player?.id;
    const mySide =
      state.players.find((p) => p.id === duel.challenger.playerId)?.playerId === viewerId
        ? duel.challenger
        : state.players.find((p) => p.id === duel.owner.playerId)?.playerId === viewerId
          ? duel.owner
          : null;

    s.emit('game:duel', {
      duel: publicDuel,
      // Null for onlookers, and for a duellist who has already answered.
      myChallenge:
        mySide && mySide.selectedIndex === null ? toPublicChallenge(mySide.challenge) : null,
    });
  }
}

function emitChallengeToPlayer(io: Server, socketRoom: string, state: GameState) {
  if (!state.currentChallenge) return;

  const activePlayer = state.players[state.currentPlayerIndex];
  if (activePlayer.isBot) return; // Bots are resolved server-side

  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  const publicChallenge = toPublicChallenge(state.currentChallenge);

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;

    const isActivePlayer =
      s.data?.player?.id === activePlayer.playerId || s.data?.player?.id === activePlayer.id;

    if (isActivePlayer) {
      s.emit('game:challenge', { challenge: publicChallenge, playerId: activePlayer.id });
    } else {
      s.emit('game:challenge-started', {
        playerId: activePlayer.id,
        skillName: state.currentChallenge.skillName,
        context: state.currentChallenge.context,
      });
    }
  }
}

function broadcastState(io: Server, socketRoom: string, state: GameState) {
  io.to(socketRoom).emit('game:state', { state: toPublicState(state) });
  emitChallengeToPlayer(io, socketRoom, state);
  emitDuel(io, socketRoom, state);
  armPhaseTimer(io, state.id);
}

function emitAnswerResult(
  io: Server,
  socketRoom: string,
  state: GameState,
  result: AnswerResult
) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const room = io.sockets.adapter.rooms.get(socketRoom);
  if (!room) return;

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;

    const isActivePlayer =
      s.data?.player?.id === activePlayer.playerId || s.data?.player?.id === activePlayer.id;

    // Onlookers learn the outcome, not the answer or the mastery numbers.
    s.emit('game:answer-result', {
      result: isActivePlayer
        ? result
        : { isCorrect: result.isCorrect, timedOut: result.timedOut },
      playerId: activePlayer.id,
    });
  }
}

function checkAndEmitGameOver(io: Server, socketRoom: string, state: GameState) {
  if (state.phase !== 'FINISHED') return;

  clearPhaseTimer(state.id);

  const scores = gameService.getScores(state.id);
  const masteryReports = gameService.getMasteryReports(state.id);
  if (scores) {
    io.to(socketRoom).emit('game:finished', { scores, masteryReports });
    // Queued, not awaited — the scoreboard is already on its way to the players.
    recordGameResult(state, scores);
  }

  // Keep the state around briefly for late score requests, then release it.
  if (!cleanupTimers.has(state.id)) {
    const timer = setTimeout(() => {
      gameService.removeGame(state.id);
      cleanupTimers.delete(state.id);
    }, FINISHED_GAME_TTL_MS);
    cleanupTimers.set(state.id, timer);
  }
}

// ---- Phase deadlines ----

function clearPhaseTimer(gameId: string) {
  const timer = phaseTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    phaseTimers.delete(gameId);
  }
}

/**
 * (Re)arm the deadline for whatever the game is currently waiting on. Called
 * after every broadcast, so the timer always matches the live phase.
 */
function armPhaseTimer(io: Server, gameId: string, overrideMs?: number) {
  clearPhaseTimer(gameId);

  const state = gameService.getGameSync(gameId);
  if (!state || state.phase !== 'PLAYING') return;

  // MOVING and RESOLVE_TILE are driven by the server, not by a human.
  if (state.turnPhase === 'MOVING' || state.turnPhase === 'RESOLVE_TILE') return;

  // A duel waits on the owner as well as the active player, so it still needs a
  // deadline when a bot is the one taking the turn.
  if (state.turnPhase === 'MATH_DUEL' && state.duelState) {
    const deadline = state.duelState.startedAt + state.duelState.timeLimit * 1000 + CHALLENGE_GRACE_MS;
    const timer = setTimeout(() => {
      phaseTimers.delete(gameId);
      void resolveStall(io, gameId);
    }, Math.max(1_000, deadline - Date.now()));

    phaseTimers.set(gameId, timer);
    return;
  }

  // Bot turns run to completion synchronously.
  if (state.players[state.currentPlayerIndex].isBot) return;

  let delay: number;
  if (overrideMs !== undefined) {
    delay = overrideMs;
  } else if (state.currentChallenge) {
    const deadline =
      state.currentChallenge.startedAt +
      state.currentChallenge.timeLimit * 1000 +
      CHALLENGE_GRACE_MS;
    delay = Math.max(1_000, deadline - Date.now());
  } else {
    delay = DECISION_TIMEOUT_MS;
  }

  const timer = setTimeout(() => {
    phaseTimers.delete(gameId);
    void resolveStall(io, gameId);
  }, delay);

  phaseTimers.set(gameId, timer);
}

async function resolveStall(io: Server, gameId: string) {
  const outcome = gameService.resolveStalledTurn(gameId);
  if (!outcome) return;

  const socketRoom = getSocketRoom(gameId);

  if (outcome.result) {
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result);
  }

  // A duel forced to settle reveals its result like a normal one.
  if (outcome.state.duelState?.resolution) {
    io.to(socketRoom).emit('game:duel-result', {
      duel: toPublicDuel(outcome.state.duelState),
      resolution: outcome.state.duelState.resolution,
    });
  }

  broadcastState(io, socketRoom, outcome.state);

  // A timed-out roll or jail escape leaves the player mid-move.
  if (outcome.state.turnPhase === 'MOVING') {
    const moved = gameService.executeMove(gameId);
    if (moved) broadcastState(io, socketRoom, moved);
  }

  await handleEndTurnFlow(io, gameId);
}

// ---- Turn advancement ----

async function handleEndTurnFlow(io: Server, gameId: string) {
  const currentState = gameService.getGameSync(gameId);
  if (!currentState || currentState.turnPhase !== 'END_TURN') return;

  const state = gameService.endTurn(gameId);
  if (!state) return;

  const socketRoom = getSocketRoom(gameId);
  broadcastState(io, socketRoom, state);
  checkAndEmitGameOver(io, socketRoom, state);

  if (state.phase === 'PLAYING') {
    await triggerBotTurnIfNeeded(io, gameId);
  }
}

async function triggerBotTurnIfNeeded(io: Server, gameId: string) {
  const state = gameService.getGameSync(gameId);
  if (!state || state.phase === 'FINISHED') return;

  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer.isBot) return;

  clearPhaseTimer(gameId);

  const steps = gameService.executeBotTurn(gameId);
  if (!steps || steps.length === 0) return;

  const socketRoom = getSocketRoom(gameId);

  for (const step of steps) {
    await new Promise((resolve) => setTimeout(resolve, step.delay));
    io.to(socketRoom).emit('game:state', { state: toPublicState(step.state) });
    io.to(socketRoom).emit('game:bot-action', {
      botId: currentPlayer.id,
      botName: currentPlayer.name,
      action: step.action,
    });
  }

  const finalState = gameService.getGameSync(gameId);
  if (!finalState) return;

  checkAndEmitGameOver(io, socketRoom, finalState);

  if (finalState.phase === 'PLAYING') {
    if (getCurrentPlayer(finalState).isBot) {
      await triggerBotTurnIfNeeded(io, gameId);
    } else {
      armPhaseTimer(io, gameId);
    }
  }
}

// ============================================
// Socket wiring
// ============================================

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const playerId = socket.data.player.id;

  /** Confirms the caller is the active player and returns the live state. */
  function validateTurn(gameId: string): GameState | null {
    const state = gameService.getGameSync(gameId);
    if (!state) return null;

    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.playerId !== playerId && activePlayer.id !== playerId) {
      socket.emit('game:error', { message: 'Not your turn' });
      return null;
    }
    return state;
  }

  /** Wrap a plain state transition: validate, apply, broadcast, advance. */
  function runAction(
    gameId: string,
    action: (id: string) => GameState | null,
    errorMessage?: string
  ) {
    if (!validateTurn(gameId)) return;

    const state = action(gameId);
    if (!state) {
      if (errorMessage) socket.emit('game:error', { message: errorMessage });
      return;
    }

    const socketRoom = getSocketRoom(gameId);
    broadcastState(io, socketRoom, state);
    void handleEndTurnFlow(io, gameId);
  }

  /**
   * Wrap an answer submission: validate, grade, report, advance.
   *
   * `autoEnd` mirrors the original pacing — a challenge that resolves the whole
   * turn rolls straight on, but one that only unlocks movement stops so the
   * player can see where they landed before ending the turn themselves.
   */
  function runAnswer(
    gameId: string,
    action: (id: string) => { state: GameState; result: AnswerResult } | null,
    opts: { autoEnd?: boolean; errorMessage?: string } = {}
  ) {
    if (!validateTurn(gameId)) return;

    const outcome = action(gameId);
    if (!outcome) {
      if (opts.errorMessage) socket.emit('game:error', { message: opts.errorMessage });
      return;
    }

    const socketRoom = getSocketRoom(gameId);
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result);
    broadcastState(io, socketRoom, outcome.state);

    // Dice and jail challenges leave the player ready to move.
    if (outcome.state.turnPhase === 'MOVING') {
      const moved = gameService.executeMove(gameId);
      if (moved) broadcastState(io, socketRoom, moved);
    }

    if (opts.autoEnd !== false) void handleEndTurnFlow(io, gameId);
  }

  // ---- Reconnect ----

  socket.on('game:request-state', async (data: { gameId: string }) => {
    const socketRoom = getSocketRoom(data.gameId);
    socket.join(socketRoom);
    socket.data.gameId = data.gameId;

    const state = await gameService.getGame(data.gameId);
    if (!state) return;

    socket.emit('game:state', { state: toPublicState(state) });

    const activePlayer = state.players[state.currentPlayerIndex];
    const isActivePlayer =
      activePlayer && (activePlayer.playerId === playerId || activePlayer.id === playerId);

    if (state.currentChallenge && isActivePlayer) {
      socket.emit('game:challenge', {
        challenge: toPublicChallenge(state.currentChallenge),
        playerId: activePlayer.id,
      });
    }

    // The player is back — restore the normal deadline.
    if (isActivePlayer) armPhaseTimer(io, data.gameId);
  });

  socket.on('game:request-challenge', async (data: { gameId: string }) => {
    const state = await gameService.getGame(data.gameId);
    if (!state?.currentChallenge) return;

    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer && (activePlayer.playerId === playerId || activePlayer.id === playerId)) {
      socket.emit('game:challenge', {
        challenge: toPublicChallenge(state.currentChallenge),
        playerId: activePlayer.id,
      });
    }
  });

  // ---- Roll ----

  socket.on('game:roll', (data: { gameId: string }) => {
    if (!validateTurn(data.gameId)) return;

    const state = gameService.startRoll(data.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot roll right now' });
      return;
    }

    const socketRoom = getSocketRoom(data.gameId);
    broadcastState(io, socketRoom, state);

    // Deliberately no auto end-turn: the player sees where they landed and
    // ends the turn themselves. The phase timer covers them walking away.
    if (state.turnPhase === 'MOVING') {
      const moved = gameService.executeMove(data.gameId);
      if (moved) broadcastState(io, socketRoom, moved);
    }
  });

  // ---- Challenge answers ----

  type AnswerPayload = { gameId: string; selectedIndex: number; timeMs: number };

  // The Roll Challenge only unlocks the dice — the player still gets to see the
  // tile they land on and end the turn themselves.
  socket.on('game:roll-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitRollChallengeAnswer(id, d.selectedIndex, d.timeMs), {
      autoEnd: false,
      errorMessage: 'No active Roll Challenge',
    }));

  /**
   * A duel answer, from either side. Unlike every other answer this is NOT
   * gated on `validateTurn` — the property owner answers on someone else's
   * turn, which is the whole point. `submitDuelAnswer` matches the caller to a
   * duel side and ignores anyone who is not in it.
   */
  socket.on('game:duel-answer', (d: AnswerPayload) => {
    const state = gameService.getGameSync(d.gameId);
    if (!state?.duelState) return;

    // Sockets carry the DB player id; duel sides carry the seat id.
    const seat = state.players.find((p) => p.playerId === playerId);
    if (!seat) return;

    const outcome = gameService.submitDuelAnswer(d.gameId, seat.id, d.selectedIndex, d.timeMs);
    if (!outcome) return;

    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, outcome.state);

    if (outcome.resolution) {
      io.to(socketRoom).emit('game:duel-result', {
        duel: toPublicDuel(outcome.state.duelState!),
        resolution: outcome.resolution,
      });
      void handleEndTurnFlow(io, d.gameId);
    }
  });

  socket.on('game:smart-buy-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitSmartBuyAnswer(id, d.selectedIndex, d.timeMs), {
      errorMessage: 'No active Smart Buy challenge',
    }));

  socket.on('game:card-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitCardAnswer(id, d.selectedIndex, d.timeMs)));

  socket.on('game:jail-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitJailAnswer(id, d.selectedIndex, d.timeMs)));

  socket.on('game:level-up-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitLevelUpAnswer(id, d.selectedIndex, d.timeMs)));

  // ---- Challenge starts (no turn advance — they open a question) ----

  function runChallengeStart(gameId: string, action: (id: string) => GameState | null, errorMessage?: string) {
    if (!validateTurn(gameId)) return;

    const state = action(gameId);
    if (!state) {
      if (errorMessage) socket.emit('game:error', { message: errorMessage });
      return;
    }
    broadcastState(io, getSocketRoom(gameId), state);
  }

  socket.on('game:smart-buy', (d: { gameId: string }) =>
    runChallengeStart(d.gameId, gameService.startSmartBuy, 'Cannot Smart Buy right now'));

  socket.on('game:jail-math', (d: { gameId: string }) =>
    runChallengeStart(d.gameId, gameService.jailMathEscape));

  socket.on('game:level-up', (d: { gameId: string }) =>
    runChallengeStart(d.gameId, gameService.startLevelUp));

  // ---- Decisions ----

  socket.on('game:buy-full', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.buyFull, 'Cannot buy right now'));

  socket.on('game:skip-buy', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.skipBuy));

  socket.on('game:card-ack', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.acknowledgeCard));

  socket.on('game:jail-bail', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.payBail(d.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Cannot pay bail' });
      return;
    }

    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, state);

    if (state.turnPhase === 'MOVING') {
      const moved = gameService.executeMove(d.gameId);
      if (moved) broadcastState(io, socketRoom, moved);
    }
    void handleEndTurnFlow(io, d.gameId);
  });

  socket.on('game:jail-wait', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.waitInJail(d.gameId);
    if (!state) return;

    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, state);

    if (state.turnPhase === 'MOVING') {
      const moved = gameService.executeMove(d.gameId);
      if (moved) broadcastState(io, socketRoom, moved);
    }
    void handleEndTurnFlow(io, d.gameId);
  });

  socket.on('game:level-up-decline', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.declineLevelUp));

  socket.on('game:end-turn', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;
    void handleEndTurnFlow(io, d.gameId);
  });

  // ---- Disconnect ----

  socket.on('disconnect', () => {
    const gameId: string | undefined = socket.data.gameId;
    if (!gameId) return;

    const state = gameService.getGameSync(gameId);
    if (!state || state.phase !== 'PLAYING') return;

    const activePlayer = state.players[state.currentPlayerIndex];
    const wasActivePlayer =
      activePlayer && (activePlayer.playerId === playerId || activePlayer.id === playerId);

    // Everyone else is blocked on this player. Give them a short window to come
    // back, then move the game on without them.
    if (wasActivePlayer) {
      armPhaseTimer(io, gameId, DISCONNECT_GRACE_MS);
    }
  });
};
