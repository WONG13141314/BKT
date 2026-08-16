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
import { AnswerResult, GameState } from '../features/game/game.types';
import { getCurrentPlayer } from '../features/game/game.engine';
import { recordGameResult } from '../features/game/game.persistence';
import {
  findMasteryReportForSocket,
  publishFinishedToSocket,
  publishGameState,
  publishGameStateToSocket,
  toPublicDuelState,
} from './game.publisher';

// ---- Deadlines ----

/** How long a player may sit on a decision (buy, jail, level up, end turn). */
const DECISION_TIMEOUT_MS = 90_000;
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

function broadcastState(io: Server, _socketRoom: string, state: GameState) {
  publishGameState(io, state);
  scheduleBotDuelAnswer(io, state.id);
  armPhaseTimer(io, state.id);
}

// ---- Bot duellists ----
//
// A bot's duel answer used to be submitted only when the human submitted theirs,
// so its side read "Thinking…" until the human moved and then flipped instantly.
// Give it a beat of its own instead, so the card behaves the same whether the
// opponent is a bot or a person.

const botDuelTimers = new Map<string, NodeJS.Timeout>();
const BOT_DUEL_THINK_MS = 2_200;

function clearBotDuelTimer(gameId: string) {
  const timer = botDuelTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    botDuelTimers.delete(gameId);
  }
}

function scheduleBotDuelAnswer(io: Server, gameId: string) {
  const state = gameService.getGameSync(gameId);

  if (!state || !isDuelPending(state)) {
    clearBotDuelTimer(gameId);
    return;
  }

  const waitingOnBot = [state.duelState!.challenger, state.duelState!.owner].some((side) => {
    if (side.selectedIndex !== null) return false;
    return state.players.find((p) => p.id === side.playerId)?.isBot === true;
  });

  if (!waitingOnBot || botDuelTimers.has(gameId)) return;

  const timer = setTimeout(() => {
    botDuelTimers.delete(gameId);

    const outcome = gameService.submitBotDuelAnswers(gameId);
    if (!outcome) return;

    const socketRoom = getSocketRoom(gameId);
    broadcastState(io, socketRoom, outcome.state);

    if (outcome.resolution) {
      emitDuelResult(io, socketRoom, outcome.state);
      if (getCurrentPlayer(outcome.state).isBot) void handleEndTurnFlow(io, gameId);
    }
  }, BOT_DUEL_THINK_MS);

  botDuelTimers.set(gameId, timer);
}

function emitDuelResult(io: Server, socketRoom: string, state: GameState) {
  if (!state.duelState?.resolution) return;

  io.to(socketRoom).emit('game:duel-result', {
    duel: toPublicDuelState(state.duelState),
    resolution: state.duelState.resolution,
  });
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

    const isActivePlayer = s.data?.player?.id === activePlayer.playerId;

    // Onlookers learn the outcome, not the answer or the mastery numbers.
    const publicResult = isActivePlayer
      ? {
          isCorrect: result.isCorrect,
          correctAnswer: result.correctAnswer,
          reward: result.reward,
          streakCount: result.streakCount,
          streakBroken: result.streakBroken,
          showHintNext: result.showHintNext,
          timedOut: result.timedOut,
        }
      : { isCorrect: result.isCorrect, timedOut: result.timedOut };

    s.emit('game:answer-result', {
      result: publicResult,
      playerId: activePlayer.id,
    });
  }
}

function checkAndEmitGameOver(io: Server, socketRoom: string, state: GameState) {
  if (state.phase !== 'FINISHED') return;

  clearPhaseTimer(state.id);
  clearBotDuelTimer(state.id);

  const scores = gameService.getScores(state.id);
  if (scores) {
    // The money scoreboard is public — that is the Monopoly half, and it is meant
    // to be compared. Mastery is not: showing every player's learning numbers
    // side by side tells the weakest child, in front of their friends, that they
    // are bottom of the table. Each player gets their own report and no one
    // else's.
    const reports = gameService.getMasteryReports(state.id) ?? [];
    const room = io.sockets.adapter.rooms.get(socketRoom);

    for (const socketId of room ?? []) {
      const s = io.sockets.sockets.get(socketId);
      if (!s) continue;
      const report = findMasteryReportForSocket(s, reports, state);
      publishFinishedToSocket(s, state, scores, report);
    }

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

  if (state.turnPhase === 'AUCTION' && state.auctionState) {
    const timer = setTimeout(() => {
      phaseTimers.delete(gameId);
      void resolveStall(io, gameId);
    }, Math.max(500, state.auctionState.endsAt - Date.now()));
    phaseTimers.set(gameId, timer);
    return;
  }

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

  // Bot turns normally run to completion, but errors or edge cases can
  // leave a bot stranded. Arm a generous safety timer so `resolveStall`
  // can push the turn forward if `triggerBotTurnIfNeeded` fails.
  if (state.players[state.currentPlayerIndex].isBot) {
    const timer = setTimeout(() => {
      phaseTimers.delete(gameId);
      void resolveStall(io, gameId);
    }, overrideMs ?? 15_000);
    phaseTimers.set(gameId, timer);
    return;
  }

  let delay: number;
  if (overrideMs !== undefined) {
    delay = overrideMs;
  } else if (state.currentChallenge && state.currentChallenge.timeLimit > 0) {
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
  emitDuelResult(io, socketRoom, outcome.state);

  broadcastState(io, socketRoom, outcome.state);

  // A timed-out roll or jail escape leaves the player mid-move.
  advanceServerPhases(io, gameId, socketRoom);

  const live = gameService.getGameSync(gameId);
  if (live && getCurrentPlayer(live).isBot) {
    if (live.turnPhase === 'END_TURN') await handleEndTurnFlow(io, gameId);
    else if (live.turnPhase === 'ROLL_PHASE') await triggerBotTurnIfNeeded(io, gameId);
  }
}

// ---- Turn advancement ----

/**
 * Run the phases the server drives on its own, until the game is waiting on a
 * person again.
 *
 * `MOVING` walks the token and resolves the tile. `RESOLVE_TILE` can also stand
 * alone now, because a challenge card may teleport the player and the tile they
 * arrive on still has to be resolved. Looping covers a card that moves you onto
 * another card.
 */
function advanceServerPhases(io: Server, gameId: string, socketRoom: string) {
  for (let guard = 0; guard < 8; guard++) {
    const state = gameService.getGameSync(gameId);
    if (!state) return;

    const next =
      state.turnPhase === 'MOVING'
        ? gameService.executeMove(gameId)
        : state.turnPhase === 'RESOLVE_TILE'
          ? gameService.resolveTile(gameId)
          : null;

    if (!next) return;
    broadcastState(io, socketRoom, next);
  }
}

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

/** True while a duel is open and still waiting on at least one answer. */
function isDuelPending(state: GameState): boolean {
  return state.turnPhase === 'MATH_DUEL' && !!state.duelState && !state.duelState.resolution;
}

async function triggerBotTurnIfNeeded(io: Server, gameId: string) {
  const state = gameService.getGameSync(gameId);
  if (!state || state.phase === 'FINISHED') return;

  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer.isBot) return;

  clearPhaseTimer(gameId);

  let steps: ReturnType<typeof gameService.executeBotTurn>;
  try {
    steps = gameService.executeBotTurn(gameId);
  } catch (err) {
    console.error(`[BotTurn] Error executing bot turn for ${gameId}:`, err);
    // Force the turn forward so the game isn't permanently stuck.
    const socketRoom = getSocketRoom(gameId);
    const stuck = gameService.getGameSync(gameId);
    if (stuck) {
      const recovered = gameService.resolveStalledTurn(gameId);
      if (recovered) {
        broadcastState(io, socketRoom, recovered.state);
        advanceServerPhases(io, gameId, socketRoom);
        await handleEndTurnFlow(io, gameId);
      } else {
        broadcastState(io, socketRoom, stuck);
      }
    }
    return;
  }

  const socketRoom = getSocketRoom(gameId);

  if (!steps || steps.length === 0) {
    // The bot could not advance — it is waiting on a human. Broadcast properly
    // so whoever is being waited on actually receives their prompt, and restore
    // the deadline this function cleared on the way in.
    broadcastState(io, socketRoom, gameService.getGameSync(gameId)!);
    return;
  }

  for (const step of steps) {
    await new Promise((resolve) => setTimeout(resolve, step.delay));
    publishGameState(io, step.state);
    io.to(socketRoom).emit('game:bot-action', {
      botId: currentPlayer.id,
      botName: currentPlayer.name,
      action: step.action,
    });
  }

  const finalState = gameService.getGameSync(gameId);
  if (!finalState) return;

  // A bot turn does not always finish. If it landed on a human's property the
  // duel needs that human's answer before it can settle.
  //
  // The raw emits above deliberately skip `emitDuel`, so without this the owner
  // would never be sent their question; and because this function clears the
  // phase timer on entry, recursing here would destroy the duel deadline on
  // every pass and spin the turn forever. Hand control to the duel handler.
  if (isDuelPending(finalState)) {
    broadcastState(io, socketRoom, finalState);
    return;
  }

  checkAndEmitGameOver(io, socketRoom, finalState);

  if (finalState.phase === 'PLAYING') {
    // Only recurse when the turn actually moved on. Anything else means the bot
    // is stuck, and repeating the same turn would loop indefinitely.
    const advanced = finalState.currentPlayerIndex !== state.currentPlayerIndex;

    if (advanced && getCurrentPlayer(finalState).isBot) {
      await triggerBotTurnIfNeeded(io, gameId);
    } else {
      // Broadcast and arm the safety timer. If the bot somehow didn't
      // advance, the timer will push the turn forward.
      broadcastState(io, socketRoom, finalState);
    }
  }
}

// ============================================
// Socket wiring
// ============================================

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const playerId = socket.data.player.id;

  const findAuthenticatedSeat = (state: GameState) =>
    state.players.find((seat) => seat.playerId === playerId);

  /** Confirms the caller is the active player and returns the live state. */
  function validateTurn(gameId: string): GameState | null {
    const state = gameService.getGameSync(gameId);
    if (!state) return null;

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
    broadcastState(io, socketRoom, state);
    advanceServerPhases(io, gameId, socketRoom);
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

    const outcome = action(gameId);
    if (!outcome) {
      if (opts.errorMessage) socket.emit('game:error', { message: opts.errorMessage });
      return;
    }

    const socketRoom = getSocketRoom(gameId);
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result);
    broadcastState(io, socketRoom, outcome.state);

    // A Roll Challenge or jail escape leaves the player ready to move, and a
    // challenge card may have teleported them.
    advanceServerPhases(io, gameId, socketRoom);

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

    publishGameStateToSocket(socket, state);

    if (state.phase === 'FINISHED') {
      const scores = gameService.getScores(state.id);
      if (scores) {
        publishFinishedToSocket(
          socket,
          state,
          scores,
          findMasteryReportForSocket(socket, gameService.getMasteryReports(state.id) ?? [], state)
        );
      }
      return;
    }

    const activePlayer = state.players[state.currentPlayerIndex];
    const isActivePlayer = activePlayer?.playerId === playerId;

    // The player is back — restore the normal deadline.
    if (isActivePlayer) armPhaseTimer(io, data.gameId);
  });

  socket.on('game:request-challenge', async (data: { gameId: string }) => {
    const state = await gameService.getGame(data.gameId);
    if (!state || !findAuthenticatedSeat(state)) return;
    publishGameStateToSocket(socket, state);
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
    advanceServerPhases(io, data.gameId, socketRoom);
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
      emitDuelResult(io, socketRoom, outcome.state);
      // A human landlord may be the last respondent during a bot's turn. The
      // bot has nothing left to review or click, so hand play back immediately.
      // Human challengers keep the result visible until they end their turn.
      if (getCurrentPlayer(outcome.state).isBot) void handleEndTurnFlow(io, d.gameId);
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

  socket.on('game:auction-bid', (d: { gameId: string; amount: number }) => {
    const state = gameService.getGameSync(d.gameId);
    if (!state || state.turnPhase !== 'AUCTION') return;
    const seat = findAuthenticatedSeat(state);
    if (!seat) return;

    const next = gameService.placeAuctionBid(d.gameId, seat.id, Math.floor(d.amount));
    if (!next) {
      socket.emit('game:error', { message: 'Bid must be higher and within your available cash' });
      return;
    }
    broadcastState(io, getSocketRoom(d.gameId), next);
  });

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
      socket.emit('game:error', { message: 'Cannot pay bail' });
      return;
    }

    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, state);
    advanceServerPhases(io, d.gameId, socketRoom);
  });

  socket.on('game:jail-wait', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.waitInJail(d.gameId);
    if (!state) return;

    const socketRoom = getSocketRoom(d.gameId);
    broadcastState(io, socketRoom, state);
    advanceServerPhases(io, d.gameId, socketRoom);
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
    const wasActivePlayer = activePlayer?.playerId === playerId;

    // Everyone else is blocked on this player. Give them a short window to come
    // back, then move the game on without them.
    if (wasActivePlayer) {
      armPhaseTimer(io, gameId, DISCONNECT_GRACE_MS);
    }
  });
};
