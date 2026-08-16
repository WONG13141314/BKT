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
import { getLevelUpCost, ownsFullColorGroup } from '../features/game/board.config';
import { recordGameResult } from '../features/game/game.persistence';
import {
  publishFinishedToSocket,
  publishGameRecoveryToSocket,
  publishGameState,
  publishGameStateToSocket,
  toPublicDuelState,
} from './game.publisher';
import { getPhaseDeadline, PHASE_TIMEOUTS, PhaseTimerRegistry } from './phase.deadlines';
import { SocketPresence } from './presence.manager';

// ---- Deadlines ----

/** How long a player may sit on a decision not yet given its own phase limit. */
const DECISION_TIMEOUT_MS = 90_000;
/** Slack on top of a challenge's own time limit, to cover latency. */
const CHALLENGE_GRACE_MS = 3_000;
/** How long a finished game stays in memory so late joiners can read the scores. */
const FINISHED_GAME_TTL_MS = 5 * 60_000;

// Module scope: these outlive any single socket.
const phaseTimers = new PhaseTimerRegistry();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

// ---- Room / payload helpers ----

function getSocketRoom(gameId: string): string {
  return `room:${gameId.replace('game_', '')}`;
}

function broadcastState(io: Server, _socketRoom: string, state: GameState) {
  // Store and arm the authoritative absolute deadline before any recipient sees
  // this transition. The public payload and server timer therefore describe the
  // same phase, even for the initial MOVING broadcast after a roll.
  armPhaseTimer(io, state.id);
  const liveState = gameService.getGameSync(state.id) ?? state;
  publishGameState(io, liveState);
  scheduleBotDuelAnswer(io, liveState.id);
}

/** Starts a freshly created game on the same deadline-managed publication path as later turns. */
export function publishGameStartTransition(io: Server, state: GameState): void {
  broadcastState(io, getSocketRoom(state.id), state);
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
    const room = io.sockets.adapter.rooms.get(socketRoom);

    for (const socketId of room ?? []) {
      const s = io.sockets.sockets.get(socketId);
      if (!s) continue;
      const report = gameService.getMasteryReportForPlayer(state.id, s.data?.player?.id);
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
  phaseTimers.clear(gameId);
}

function canBuildOnEndTurn(state: GameState): boolean {
  if (state.turnPhase !== 'END_TURN') return false;

  const player = getCurrentPlayer(state);
  return state.properties.some((property) => {
    const tile = state.tiles[property.tileIndex];
    if (
      !tile ||
      tile.type !== 'PROPERTY' ||
      !tile.colorGroup ||
      property.ownerId !== player.id ||
      property.isLeveledUp ||
      !ownsFullColorGroup(player.properties, tile.colorGroup)
    ) return false;

    return player.hasLevelUpToken || player.money >= getLevelUpCost(tile);
  });
}

function savePhaseDeadline(
  gameId: string,
  state: GameState,
  deadline: number | null
): GameState {
  const phaseDeadlineFor = deadline === null ? null : state.turnPhase;
  if (state.phaseDeadline === deadline && state.phaseDeadlineFor === phaseDeadlineFor) return state;
  return gameService.replaceState(gameId, { ...state, phaseDeadline: deadline, phaseDeadlineFor });
}

/**
 * (Re)arm the deadline for whatever the game is currently waiting on. Called
 * after every broadcast, so the timer always matches the live phase.
 */
function armPhaseTimer(io: Server, gameId: string, overrideMs?: number) {
  clearPhaseTimer(gameId);

  let state = gameService.getGameSync(gameId);
  if (!state || state.phase !== 'PLAYING') return;

  // RESOLVE_TILE is driven by the server in the same transition loop.
  if (state.turnPhase === 'RESOLVE_TILE') {
    savePhaseDeadline(gameId, state, null);
    return;
  }

  const now = Date.now();
  const savedDeadline = state.phaseDeadlineFor === state.turnPhase ? state.phaseDeadline : null;
  const phaseDeadline = overrideMs === undefined
    ? savedDeadline ?? getPhaseDeadline(state, now, { canBuild: canBuildOnEndTurn(state) })
    : now + overrideMs;

  if (phaseDeadline !== null) {
    state = savePhaseDeadline(gameId, state, phaseDeadline);
    phaseTimers.arm(io, gameId, phaseDeadline, () => void resolveStall(io, gameId));
    return;
  }

  if (state.turnPhase === 'AUCTION' && state.auctionState) {
    const deadline = state.auctionState.endsAt;
    state = savePhaseDeadline(gameId, state, deadline);
    phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
    return;
  }

  // A duel waits on the owner as well as the active player, so it still needs a
  // deadline when a bot is the one taking the turn.
  if (state.turnPhase === 'MATH_DUEL' && state.duelState) {
    const deadline = state.duelState.startedAt + state.duelState.timeLimit * 1000 + CHALLENGE_GRACE_MS;
    state = savePhaseDeadline(gameId, state, deadline);
    phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
    return;
  }

  // Bot turns normally run to completion, but errors or edge cases can
  // leave a bot stranded. Arm a generous safety timer so `resolveStall`
  // can push the turn forward if `triggerBotTurnIfNeeded` fails.
  if (state.players[state.currentPlayerIndex].isBot) {
    const deadline = now + 15_000;
    state = savePhaseDeadline(gameId, state, deadline);
    phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
    return;
  }

  const deadline = state.currentChallenge && state.currentChallenge.timeLimit > 0
    ? state.currentChallenge.startedAt + state.currentChallenge.timeLimit * 1000 + CHALLENGE_GRACE_MS
    : now + DECISION_TIMEOUT_MS;
  state = savePhaseDeadline(gameId, state, deadline);
  phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
}

async function resolveStall(io: Server, gameId: string) {
  const stalledPhase = gameService.getGameSync(gameId)?.turnPhase;
  const outcome = gameService.resolveStalledTurn(gameId);
  if (!outcome) return;

  const socketRoom = getSocketRoom(gameId);

  if (outcome.result) {
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result);
  }

  // A duel forced to settle reveals its result like a normal one.
  emitDuelResult(io, socketRoom, outcome.state);

  publishTransition(io, gameId, socketRoom, outcome.state, stalledPhase === 'MOVING');

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
 * `MOVING` is consumed only after the client acknowledgement or server fallback
 * that explicitly permits it. `RESOLVE_TILE` can also stand alone now, because
 * a challenge card may teleport a player and the destination still has to be
 * resolved. Looping covers a card that moves a player onto another card.
 */
function advanceServerPhases(
  io: Server,
  gameId: string,
  socketRoom: string,
  allowMovement = false
) {
  let mayAdvanceMovement = allowMovement;
  for (let guard = 0; guard < 8; guard++) {
    const state = gameService.getGameSync(gameId);
    if (!state) return;

    const next =
      state.turnPhase === 'MOVING'
        ? mayAdvanceMovement
          ? gameService.executeMove(gameId)
          : null
        : state.turnPhase === 'RESOLVE_TILE'
          ? gameService.resolveTile(gameId)
          : null;

    if (!next) return;
    mayAdvanceMovement = false;
    broadcastState(io, socketRoom, next);
  }
}

/** Publish a transition, then continue only non-presentation server phases. */
function publishTransition(
  io: Server,
  gameId: string,
  socketRoom: string,
  state: GameState,
  allowMovement = false
) {
  broadcastState(io, socketRoom, state);
  advanceServerPhases(io, gameId, socketRoom, allowMovement);
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
        publishTransition(io, gameId, socketRoom, recovered.state);
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

export const registerGameHandlers = (
  io: Server,
  socket: Socket,
  presence: SocketPresence = new SocketPresence()
) => {
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

    const outcome = action(gameId);
    if (!outcome) {
      if (opts.errorMessage) socket.emit('game:error', { message: opts.errorMessage });
      return;
    }

    const socketRoom = getSocketRoom(gameId);
    emitAnswerResult(io, socketRoom, outcome.state, outcome.result);
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

    if (state.phase === 'FINISHED') {
      publishGameRecoveryToSocket(socket, state, {
        scores: gameService.getScores(state.id),
        masteryReport: gameService.getMasteryReportForPlayer(state.id, playerId),
      });
      return;
    }

    const activePlayer = state.players[state.currentPlayerIndex];
    const isActivePlayer = activePlayer?.playerId === playerId;

    // The player is back — replace disconnect grace with this phase's normal
    // deadline before publishing their restored snapshot. MOVING already has
    // a shorter presentation fallback, so reconnecting must not extend it.
    if (isActivePlayer && state.turnPhase !== 'MOVING') {
      savePhaseDeadline(data.gameId, state, null);
      armPhaseTimer(io, data.gameId);
    }

    publishGameRecoveryToSocket(socket, gameService.getGameSync(data.gameId) ?? state);
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

    // The client presents the dice and pawn motion before it acknowledges this
    // roll. A bounded MOVING deadline keeps a hidden or dishonest tab from
    // blocking the room forever.
  });

  socket.on('game:movement-complete', (data: { gameId: string; diceRollId: number }) => {
    const state = validateTurn(data.gameId);
    if (!state || state.turnPhase !== 'MOVING' || state.diceRollId !== data.diceRollId) return;

    advanceServerPhases(io, data.gameId, getSocketRoom(data.gameId), true);
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
    publishTransition(io, d.gameId, socketRoom, state);
  });

  socket.on('game:jail-wait', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;

    const state = gameService.waitInJail(d.gameId);
    if (!state) return;

    const socketRoom = getSocketRoom(d.gameId);
    publishTransition(io, d.gameId, socketRoom, state);
  });

  socket.on('game:level-up-decline', (d: { gameId: string }) =>
    runAction(d.gameId, gameService.declineLevelUp));

  socket.on('game:end-turn', (d: { gameId: string }) => {
    if (!validateTurn(d.gameId)) return;
    void handleEndTurnFlow(io, d.gameId);
  });

  // ---- Disconnect ----

  socket.on('disconnect', () => {
    if (presence.disconnect(playerId, socket.id) > 0) return;

    const gameId: string | undefined = socket.data.gameId;
    if (!gameId) return;

    const state = gameService.getGameSync(gameId);
    if (!state || state.phase !== 'PLAYING') return;

    const activePlayer = state.players[state.currentPlayerIndex];
    const wasActivePlayer = activePlayer?.playerId === playerId;

    // Everyone else is blocked on this player. Give them the reconnect grace window to come
    // back, then move the game on without them.
    if (wasActivePlayer) {
      // Movement already has a shorter presentation fallback. Replacing it
      // with reconnect grace would let a vanished animation stall the table.
      armPhaseTimer(
        io,
        gameId,
        state.turnPhase === 'MOVING' ? undefined : PHASE_TIMEOUTS.disconnectGrace
      );
    }
  });
};
