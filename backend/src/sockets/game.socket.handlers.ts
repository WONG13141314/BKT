// ============================================
// Game socket commands
// One learner connection's game events: reconnect, hints, rolls, answers,
// purchases, jail choices and leaving. Every command is checked against the
// live match before it changes anything; the room runtime owns the timers.
// ============================================

import type { RealtimeServer as Server, RealtimeSocket as Socket } from './realtime.types';
import type { GameService } from '../features/game/game.runtime';
import type { AnswerResult, GameState } from '../features/game/game.types';
import { validateSelectedIndex } from './answer.validation';
import { getCurrentPlayer, hintsRemaining } from '../features/game/game.engine';
import { MAX_HINTS_PER_MATCH } from '../features/game/game.constants';
import { toPublicChallenge } from '../features/game/challenge.public';
import { publishGameRecoveryToSocket, publishGameStateToSocket } from './game.publisher';
import { disconnectGraceKey, PHASE_TIMEOUTS } from './phase.deadlines';
import type { SocketPresence } from './presence.manager';
import {
  emitAnswerResult,
  emitDuelResult,
  emitPrivateDuelAnswerResult,
  emitTimedOutDuelAnswerResults,
} from './game.emitters';

/** What the commands need from the room runtime that owns the match timers. */
export interface GameTable {
  gameService: GameService;
  getSocketRoom(gameId: string): string;
  broadcastState(io: Server, socketRoom: string, state: GameState): void;
  publishTransition(io: Server, gameId: string, socketRoom: string, state: GameState, allowMovement?: boolean): void;
  armPhaseTimer(io: Server, gameId: string, overrideMs?: number): void;
  allowAnswerReview(gameId: string, state: GameState): void;
  handleEndTurnFlow(io: Server, gameId: string): Promise<void>;
  advanceOpening(io: Server, gameId: string, readyAccount?: string): void;
  setAutopilot(io: Server, gameId: string, accountId: string, enabled: boolean): void;
  cancelAway(gameId: string, accountId: string): void;
  scheduleAway(io: Server, gameId: string, accountId: string, deadline?: number, presence?: SocketPresence): void;
  completeMovementIfReady(io: Server, gameId: string): boolean;
  acknowledgeMovement(io: Server, state: GameState, accountId: string): void;
}

export function registerGameSocketHandlers(
  table: GameTable,
  io: Server,
  socket: Socket,
  presence: SocketPresence,
): void {
  const {
    gameService,
    getSocketRoom,
    broadcastState,
    publishTransition,
    armPhaseTimer,
    allowAnswerReview,
    handleEndTurnFlow,
    advanceOpening,
    setAutopilot,
    cancelAway,
    scheduleAway,
    completeMovementIfReady,
    acknowledgeMovement,
  } = table;
  const playerId = socket.data.player.id;

  const findAuthenticatedSeat = (state: GameState) =>
    state.players.find((seat) => seat.playerId === playerId);

  /** Confirms the caller is the active player and returns the live state. */
  function validateTurn(gameId: string): GameState | null {
    const state = gameService.getGameSync(gameId);
    // Nobody acts before the opening hands out the first turn.
    if (!state || state.opening) return null;

    const activePlayer = state.players[state.currentPlayerIndex];
    if (activePlayer.playerId !== playerId) {
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
    publishTransition(io, gameId, socketRoom, state);
  }

  /**
   * Wrap an answer submission: validate, grade, report, advance.
   *
   * Human outcomes remain visible until the player deliberately ends their
   * turn. `autoEnd` is reserved for server-controlled recovery paths.
   */
  function runAnswer(
    gameId: string,
    action: (id: string) => { state: GameState; result: AnswerResult } | null,
    opts: { autoEnd?: boolean; errorMessage?: string } = {}
  ) {
    if (!validateTurn(gameId)) return;

    const challengeId = gameService.getGameSync(gameId)?.currentChallenge?.id;
    const outcome = action(gameId);
    if (!outcome) {
      if (opts.errorMessage) socket.emit('game:error', { message: opts.errorMessage });
      return;
    }

    const socketRoom = getSocketRoom(gameId);
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result, challengeId);
    allowAnswerReview(gameId, outcome.state);
    publishTransition(io, gameId, socketRoom, outcome.state);

    if (opts.autoEnd === true) void handleEndTurnFlow(io, gameId);
  }

  // ---- Reconnect ----

  socket.on('game:request-state', async (data: { gameId: string }) => {
    const state = await gameService.getGame(data.gameId);
    if (!state) {
      socket.emit('game:error', {
        code: 'GAME_NOT_FOUND',
        message: 'This game is no longer available. Please return and create a new room.',
      });
      return;
    }

    const viewerSeat = findAuthenticatedSeat(state);
    if (!viewerSeat) {
      socket.emit('game:seat-mismatch', {
        seats: state.players
          .filter((seat) => !seat.isBot)
          .map((seat) => ({ playerId: seat.playerId, name: seat.name })),
      });
      return;
    }

    const socketRoom = getSocketRoom(data.gameId);
    socket.join(socketRoom);
    socket.data.gameId = data.gameId;
    cancelAway(data.gameId, playerId);
    if (viewerSeat.autopilot) setAutopilot(io, data.gameId, playerId, false);

    if (state.phase === 'FINISHED') {
      publishGameRecoveryToSocket(socket, state, {
        scores: gameService.getScores(state.id),
        masteryReport: gameService.getMasteryReportForPlayer(state.id, playerId),
      });
      return;
    }

    // Make sure the phase has a live timer, but keep its existing absolute
    // deadline. Restarting it here let a page refresh grant a fresh decision
    // window indefinitely. MOVING keeps its presentation fallback untouched.
    const live = gameService.getGameSync(data.gameId) ?? state;
    if (getCurrentPlayer(live).playerId === playerId && live.turnPhase !== 'MOVING') {
      armPhaseTimer(io, data.gameId);
    }

    publishGameRecoveryToSocket(socket, gameService.getGameSync(data.gameId) ?? live);
  });

  // The board has drawn on this learner's screen; the first turn may begin.
  socket.on('game:board-ready', (data: unknown) => {
    const gameId = data && typeof data === 'object' ? (data as Record<string, unknown>).gameId : undefined;
    if (typeof gameId !== 'string' || socket.data.gameId !== gameId) return;
    const state = gameService.getGameSync(gameId);
    if (!state?.opening || !findAuthenticatedSeat(state)) return;
    advanceOpening(io, gameId, playerId);
  });

  socket.on('game:request-challenge', async (data: { gameId: string }) => {
    const state = await gameService.getGame(data.gameId);
    if (!state || !findAuthenticatedSeat(state)) return;
    publishGameStateToSocket(socket, state);
  });

  socket.on('game:request-hint', (
    data: unknown,
    acknowledgement?: (result: { success: boolean; error?: string }) => void
  ) => {
    const reply = (success: boolean, error?: string) => {
      if (typeof acknowledgement === 'function') acknowledgement({ success, ...(error ? { error } : {}) });
    };
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      reply(false, 'Invalid hint request.');
      return;
    }
    const { gameId, challengeId } = data as Record<string, unknown>;
    if (typeof gameId !== 'string' || typeof challengeId !== 'string' || socket.data.gameId !== gameId) {
      reply(false, 'This hint request does not match your current game.');
      return;
    }
    const state = gameService.getGameSync(gameId);
    const seat = state && findAuthenticatedSeat(state);
    if (!seat || seat.isBot) {
      reply(false, 'This question does not belong to your account.');
      return;
    }
    const outcome = gameService.requestHint(gameId, seat.id, challengeId);
    if (!outcome) {
      reply(false, hintsRemaining(seat) === 0
        ? `You have used all ${MAX_HINTS_PER_MATCH} hints for this game.`
        : 'A hint is available only while your unanswered question is active.');
      return;
    }
    const updatedSeat = outcome.state.players.find((candidate) => candidate.id === seat.id) ?? seat;
    socket.emit('game:challenge', {
      challenge: toPublicChallenge(outcome.challenge, hintsRemaining(updatedSeat)),
      playerId: seat.id,
    });
    reply(true);
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

    // The client presents the dice and pawn motion before it acknowledges this
    // roll. A bounded MOVING deadline keeps a hidden or dishonest tab from
    // blocking the room forever.
  });

  socket.on('game:movement-complete', (data: { gameId: string; diceRollId: number }) => {
    const state = gameService.getGameSync(data.gameId);
    const seat = state && findAuthenticatedSeat(state);
    const room = io.sockets.adapter.rooms.get(getSocketRoom(data.gameId));
    if (!state || !seat || seat.isBot || !room?.has(socket.id) ||
        state.turnPhase !== 'MOVING' || state.diceRollId !== data.diceRollId) return;
    acknowledgeMovement(io, state, playerId);
  });

  // ---- Challenge answers ----

  type AnswerPayload = { gameId: string; selectedIndex: unknown };

  const answerIndex = (gameId: string, selectedIndex: unknown): number | null => {
    const challenge = gameService.getGameSync(gameId)?.currentChallenge;
    return validateSelectedIndex(selectedIndex, challenge?.options.length ?? 0);
  };

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

    const side = state.duelState.challenger.playerId === seat.id
      ? state.duelState.challenger
      : state.duelState.owner.playerId === seat.id ? state.duelState.owner : null;
    if (!side) return;
    const outcome = gameService.submitDuelAnswer(
      d.gameId,
      seat.id,
      validateSelectedIndex(d.selectedIndex, side.challenge.options.length)
    );
    if (!outcome) return;

    const socketRoom = getSocketRoom(d.gameId);
    emitPrivateDuelAnswerResult(io, socketRoom, outcome.state, seat.id);
    broadcastState(io, socketRoom, outcome.state);

    if (outcome.resolution) {
      emitDuelResult(io, socketRoom, outcome.state);
      emitTimedOutDuelAnswerResults(io, socketRoom, outcome.state, seat.id);
      // A human landlord may finish the duel during a bot's turn. The bot
      // scheduler keeps the result visible for six seconds before advancing.
      // Human challengers keep it visible until they end their turn.
    }
  });

  socket.on('game:duel-continue', (data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const { gameId, duelId } = data as Record<string, unknown>;
    if (typeof gameId !== 'string' || typeof duelId !== 'string') return;

    const current = gameService.getGameSync(gameId);
    const seat = current && findAuthenticatedSeat(current);
    const socketRoom = getSocketRoom(gameId);
    const room = io.sockets.adapter.rooms.get(socketRoom);
    if (!current || !seat || seat.isBot || seat.id !== getCurrentPlayer(current).id || !room?.has(socket.id)) return;

    const state = gameService.continueDuel(gameId, duelId);
    if (!state) return;

    io.to(socketRoom).emit('game:duel-dismissed', { duelId });
    broadcastState(io, socketRoom, state);
  });

  socket.on('game:smart-buy-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitSmartBuyAnswer(id, answerIndex(id, d.selectedIndex)), {
      errorMessage: 'No active Smart Buy challenge',
    }));

  socket.on('game:card-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitCardAnswer(id, answerIndex(id, d.selectedIndex))));

  socket.on('game:jail-answer', (d: AnswerPayload) =>
    runAnswer(d.gameId, (id) => gameService.submitJailAnswer(id, answerIndex(id, d.selectedIndex))));

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

  // ---- Decisions ----

  socket.on('game:buy-full', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.buyFull, 'Cannot buy right now'));

  socket.on('game:skip-buy', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.skipBuy));

  socket.on('game:build-house', (d: { gameId: string; tileIndex: number }) => {
    if (!validateTurn(d.gameId)) return;
    const state = gameService.buildHouse(d.gameId, d.tileIndex);
    if (!state) {
      socket.emit('game:error', { message: 'This property cannot build a house right now' });
      return;
    }
    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, state);
  });

  socket.on('game:card-ack', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.acknowledgeCard));

  socket.on('game:jail-bail', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.payBail(d.gameId);
    if (!state) {
      socket.emit('game:error', { message: 'You do not have enough money to pay bail.' });
      return;
    }

    const socketRoom = getSocketRoom(d.gameId);
    publishTransition(io, d.gameId, socketRoom, state);
  });

  socket.on('game:jail-wait', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.waitInJail(d.gameId);
    if (!state) return;

    const socketRoom = getSocketRoom(d.gameId);
    publishTransition(io, d.gameId, socketRoom, state);
  });

  socket.on('game:end-turn', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;
    void handleEndTurnFlow(io, d.gameId);
  });

  // Moving this connection to another room means leaving this match now.
  socket.on('room:leave', () => {
    const gameId: string | undefined = socket.data.gameId;
    const state = gameId ? gameService.getGameSync(gameId) : null;
    if (!gameId || !state || state.phase !== 'PLAYING' || !findAuthenticatedSeat(state)) return;
    cancelAway(gameId, playerId);
    setAutopilot(io, gameId, playerId, true);
  });

  // ---- Disconnect ----

  socket.on('disconnect', () => {
    if (presence.disconnect(playerId, socket.id) > 0) return;

    const gameId: string | undefined = socket.data.gameId;
    if (!gameId) return;
    completeMovementIfReady(io, gameId);

    const state = gameService.getGameSync(gameId);
    if (!state || state.phase !== 'PLAYING') return;

    const seat = findAuthenticatedSeat(state);
    if (seat && !seat.isBot && !seat.isBankrupt && !seat.autopilot) {
      scheduleAway(io, gameId, playerId, undefined, presence);
    }

    const activePlayer = state.players[state.currentPlayerIndex];
    const wasActivePlayer = activePlayer?.playerId === playerId;

    // Everyone else is blocked on this player. Give a decision phase one
    // reconnect grace window, then move the game on without them. Movement
    // keeps its presentation fallback, and a question cannot accept answers
    // after its own expiry, so neither is extended.
    const graceKey = disconnectGraceKey(state);
    if (wasActivePlayer && !state.opening && !['MOVING', 'MATH_DUEL'].includes(state.turnPhase) && !state.currentChallenge &&
        state.disconnectGraceFor !== graceKey) {
      gameService.replaceState(gameId, { ...state, disconnectGraceFor: graceKey });
      armPhaseTimer(io, gameId, PHASE_TIMEOUTS.disconnectGrace);
    }
  });
}
