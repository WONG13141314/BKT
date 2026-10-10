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

import type { RealtimeServer as Server, RealtimeSocket as Socket } from './realtime.types';
import type { GameService } from '../features/game/game.runtime';
import type { RoomManager } from './lobby.manager';
import { defaultTimerScheduler, type TimerScheduler } from './runtime.scheduler';
import type { AnswerResult, FinalScore, GameState } from '../features/game/game.types';
import { validateSelectedIndex } from './answer.validation';
import { getCurrentPlayer, nextDuelDeadline } from '../features/game/game.engine';
import { getBotActionDelay } from '../features/game/bot.engine';
import { buildWorkedFeedback } from '../bkt/feedback';
import { toPublicChallenge } from '../features/game/challenge.public';
import { getLevelUpCost, ownsFullColorGroup } from '../features/game/board.config';
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

export interface GameHandlersSnapshot {
  botActions: Array<{ gameId: string; key: string; deadline: number }>;
  botDuels: Array<{ gameId: string; duelId: string; deadline: number }>;
  cleanup: Array<{ gameId: string; deadline: number }>;
  movements: Array<{ gameId: string; matchId: string; diceRollId: number; acknowledged: string[] }>;
}

export interface GameHandlersRuntimeOptions {
  gameService: GameService;
  roomManager?: RoomManager;
  presence?: SocketPresence;
  scheduler?: TimerScheduler;
  recordGameResult: (state: GameState, scores: FinalScore[]) => void;
}

/** All mutable handler state belongs to one room runtime. */
export function createGameHandlersRuntime(options: GameHandlersRuntimeOptions) {
  const { gameService, recordGameResult } = options;
  const scheduler = options.scheduler ?? defaultTimerScheduler;
  const defaultPresence = options.presence ?? new SocketPresence();
  const phaseTimers = new PhaseTimerRegistry(scheduler);
  const cleanupTimers = new Map<string, { timer: unknown; deadline: number }>();
  const restoredBotActions = new Map<string, { key: string; deadline: number }>();
  const restoredBotDuels = new Map<string, { duelId: string; deadline: number }>();
  const restoredCleanup = new Map<string, number>();

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
    syncMovementPresentation(liveState);
    scheduleBotDuelAnswer(io, liveState.id);
    void triggerBotTurnIfNeeded(io, liveState.id);
  }

  /** Starts a freshly created game on the same deadline-managed publication path as later turns. */
  function publishGameStartTransition(io: Server, state: GameState): void {
    broadcastState(io, getSocketRoom(state.id), state);
  }

  // ---- Bot duellists ----
  //
  // A bot's duel answer used to be submitted only when the human submitted theirs,
  // so its side read "Thinking…" until the human moved and then flipped instantly.
  // Give it a beat of its own instead, so the card behaves the same whether the
  // opponent is a bot or a person.

  const botDuelTimers = new Map<string, { duelId: string; timer: unknown; deadline: number }>();
  const BOT_DUEL_THINK_MS = 2_200;

  function clearBotDuelTimer(gameId: string) {
    const pending = botDuelTimers.get(gameId);
    if (pending) {
      scheduler.clearTimeout(pending.timer);
      botDuelTimers.delete(gameId);
    }
    restoredBotDuels.delete(gameId);
  }

  function scheduleBotDuelAnswer(io: Server, gameId: string) {
    const state = gameService.getGameSync(gameId);

    if (!state || !isDuelPending(state)) {
      clearBotDuelTimer(gameId);
      return;
    }

    const waitingOnBot = [state.duelState!.challenger, state.duelState!.owner].some((side) => {
      if (side.selectedIndex !== null || side.timedOut) return false;
      return state.players.find((p) => p.id === side.playerId)?.isBot === true;
    });

    if (!waitingOnBot) {
      clearBotDuelTimer(gameId);
      return;
    }
    const duelId = toPublicDuelState(state.duelState!).id;
    if (botDuelTimers.get(gameId)?.duelId === duelId) return;
    const saved = restoredBotDuels.get(gameId);
    const deadline = saved?.duelId === duelId ? saved.deadline : Date.now() + BOT_DUEL_THINK_MS;
    clearBotDuelTimer(gameId);

    const timer = scheduler.setTimeout(() => {
      if (botDuelTimers.get(gameId)?.duelId !== duelId) return;
      botDuelTimers.delete(gameId);
      const live = gameService.getGameSync(gameId);
      if (!live?.duelState || toPublicDuelState(live.duelState).id !== duelId) return;

      const outcome = gameService.submitBotDuelAnswers(gameId);
      if (!outcome) return;

      const socketRoom = getSocketRoom(gameId);
      broadcastState(io, socketRoom, outcome.state);

      if (outcome.resolution) {
        emitDuelResult(io, socketRoom, outcome.state);
      }
    }, Math.max(0, deadline - Date.now()), `bot-duel:${gameId}`);

    botDuelTimers.set(gameId, { duelId, timer, deadline });
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
    result: AnswerResult,
    challengeId?: string
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
             timedOut: result.timedOut,
             assisted: result.assisted,
             feedback: result.feedback,
          }
        : { isCorrect: result.isCorrect, timedOut: result.timedOut };

      s.emit('game:answer-result', {
        result: publicResult,
        playerId: activePlayer.id,
        ...(challengeId ? { challengeId } : {}),
      });
    }
  }

  function checkAndEmitGameOver(io: Server, socketRoom: string, state: GameState) {
    if (state.phase !== 'FINISHED') return;

    clearPhaseTimer(state.id);
    clearBotDuelTimer(state.id);
    clearBotActionTimer(state.id);
    movementPresentations.delete(state.id);

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

    scheduleCleanup(state.id);
  }

  function scheduleCleanup(gameId: string): void {
    if (cleanupTimers.has(gameId)) return;
    const deadline = restoredCleanup.get(gameId) ?? Date.now() + FINISHED_GAME_TTL_MS;
    restoredCleanup.delete(gameId);
    const timer = scheduler.setTimeout(() => {
      gameService.removeGame(gameId);
      cleanupTimers.delete(gameId);
    }, Math.max(0, deadline - Date.now()), `cleanup:${gameId}`);
    cleanupTimers.set(gameId, { timer, deadline });
  }

  // ---- Phase deadlines ----

  function clearPhaseTimer(gameId: string) {
    phaseTimers.clear(gameId);
  }

  /** Sends reveal details only to the authenticated learner who answered a duel side. */
  function emitPrivateDuelAnswerResult(
    io: Server,
    socketRoom: string,
    state: GameState,
    seatId: string
  ) {
    const duel = state.duelState;
    const side = duel && [duel.challenger, duel.owner].find((candidate) => candidate.playerId === seatId);
    const learner = state.players.find((player) => player.id === seatId);
    const room = io.sockets.adapter.rooms.get(socketRoom);
    if (!side || !learner || learner.isBot || !room) return;

    const result = {
      isCorrect: side.isCorrect === true,
      correctAnswer: side.challenge.options[side.challenge.correctIndex] ?? '',
      reward: { type: 'NONE' as const, value: 0, description: 'Duel answer recorded.' },
      streakCount: learner.streak,
      streakBroken: false,
      timedOut: side.timedOut === true,
      assisted: side.challenge.hintRequestedAt !== undefined,
      feedback: buildWorkedFeedback(side.challenge),
    };

    for (const socketId of room) {
      const recipient = io.sockets.sockets.get(socketId);
      if (recipient?.data?.player?.id !== learner.playerId) continue;
      recipient.emit('game:answer-result', { result, playerId: learner.id, challengeId: side.challenge.id });
    }
  }

  function emitTimedOutDuelAnswerResults(
    io: Server,
    socketRoom: string,
    state: GameState,
    exceptSeatId?: string
  ) {
    const duel = state.duelState;
    if (!duel?.resolution) return;
    for (const side of [duel.challenger, duel.owner]) {
      if (side.timedOut && side.playerId !== exceptSeatId) {
        emitPrivateDuelAnswerResult(io, socketRoom, state, side.playerId);
      }
    }
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

    const state = gameService.getGameSync(gameId);
    if (!state || state.phase !== 'PLAYING') return;

    // RESOLVE_TILE is driven by the server in the same transition loop.
    if (state.turnPhase === 'RESOLVE_TILE') {
      savePhaseDeadline(gameId, state, null);
      return;
    }

    const now = Date.now();

    // A duel has one deadline per learner. Recompute its next side-specific
    // expiry on every publication instead of reusing the last phase deadline.
    if (state.turnPhase === 'MATH_DUEL' && state.duelState) {
      const deadline = nextDuelDeadline(state.duelState);
      if (deadline !== null) {
        savePhaseDeadline(gameId, state, deadline);
        phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
      }
      return;
    }

    const savedDeadline = state.phaseDeadlineFor === state.turnPhase ? state.phaseDeadline : null;
    const phaseDeadline = overrideMs === undefined
      ? savedDeadline ?? getPhaseDeadline(state, now, { canBuild: canBuildOnEndTurn(state) })
      : now + overrideMs;

    if (phaseDeadline !== null) {
      savePhaseDeadline(gameId, state, phaseDeadline);
      phaseTimers.arm(io, gameId, phaseDeadline, () => void resolveStall(io, gameId));
      return;
    }

    // Bot turns normally run to completion, but errors or edge cases can
    // leave a bot stranded. Arm a generous safety timer so `resolveStall`
    // can push the turn forward if `triggerBotTurnIfNeeded` fails.
    if (state.players[state.currentPlayerIndex].isBot) {
      const deadline = now + 15_000;
      savePhaseDeadline(gameId, state, deadline);
      phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
      return;
    }

    const deadline = state.currentChallenge && state.currentChallenge.timeLimit > 0
      ? state.currentChallenge.startedAt + state.currentChallenge.timeLimit * 1000 + CHALLENGE_GRACE_MS
      : now + DECISION_TIMEOUT_MS;
    savePhaseDeadline(gameId, state, deadline);
    phaseTimers.arm(io, gameId, deadline, () => void resolveStall(io, gameId));
  }

  async function resolveStall(io: Server, gameId: string) {
    const before = gameService.getGameSync(gameId);
    const stalledPhase = before?.turnPhase;
    const outcome = gameService.resolveStalledTurn(gameId);
    if (!outcome) return;

    const socketRoom = getSocketRoom(gameId);

    if (outcome.result) {
      emitAnswerResult(io, socketRoom, outcome.state, outcome.result, before?.currentChallenge?.id);
    }

    // A duel forced to settle reveals its result like a normal one.
    emitDuelResult(io, socketRoom, outcome.state);
    emitTimedOutDuelAnswerResults(io, socketRoom, outcome.state);

    publishTransition(io, gameId, socketRoom, outcome.state, stalledPhase === 'MOVING');
    const finalState = gameService.getGameSync(gameId);
    if (finalState?.phase === 'FINISHED') checkAndEmitGameOver(io, socketRoom, finalState);

    // Publication schedules the next bot phase; a resolved duel keeps its result
    // visible for the same pause whether it ended by submission or timeout.
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

  const botActionTimers = new Map<string, { key: string; timer: unknown; deadline: number }>();

  function clearBotActionTimer(gameId: string): void {
    const pending = botActionTimers.get(gameId);
    if (pending) scheduler.clearTimeout(pending.timer);
    botActionTimers.delete(gameId);
    restoredBotActions.delete(gameId);
  }

  /** Stable phase identity; publication-only deadline changes are immaterial. */
  function botActionKey(state: GameState): string {
    return [state.dbGameId, getCurrentPlayer(state).id, state.turnPhase,
      state.diceRollId, state.currentChallenge?.id ?? '',
      state.duelState ? toPublicDuelState(state.duelState).id : ''].join('|');
  }

  /** At most one pending bot action per game, computed only when it runs. */
  async function triggerBotTurnIfNeeded(io: Server, gameId: string): Promise<void> {
    const state = gameService.getGameSync(gameId);
    const delay = state ? getBotActionDelay(state) : null;
    if (!state || delay === null) {
      clearBotActionTimer(gameId);
      return;
    }
    const key = botActionKey(state);
    if (botActionTimers.get(gameId)?.key === key) return;
    const saved = restoredBotActions.get(gameId);
    const deadline = saved?.key === key ? saved.deadline : Date.now() + delay;
    clearBotActionTimer(gameId);

    const timer = scheduler.setTimeout(() => {
      if (botActionTimers.get(gameId)?.key !== key) return;
      botActionTimers.delete(gameId);
      const live = gameService.getGameSync(gameId);
      if (!live || botActionKey(live) !== key) {
        void triggerBotTurnIfNeeded(io, gameId);
        return;
      }
      const bot = getCurrentPlayer(live);
      const socketRoom = getSocketRoom(gameId);
      try {
        const step = gameService.executeBotStep(gameId);
        if (!step) return;
        publishTransition(io, gameId, socketRoom, step.state);
        io.to(socketRoom).emit('game:bot-action', {
          botId: bot.id, botName: bot.name, action: step.action,
        });
        checkAndEmitGameOver(io, socketRoom, gameService.getGameSync(gameId) ?? step.state);
      } catch (error) {
        console.error('[BotTurn] Could not advance bot phase:', error);
        const recovered = gameService.resolveStalledTurn(gameId);
        if (recovered) publishTransition(io, gameId, socketRoom, recovered.state);
        else if (gameService.getGameSync(gameId)) broadcastState(io, socketRoom, gameService.getGameSync(gameId)!);
        const finalState = gameService.getGameSync(gameId);
        if (finalState?.phase === 'FINISHED') checkAndEmitGameOver(io, socketRoom, finalState);
      }
    }, Math.max(0, deadline - Date.now()), `bot-action:${gameId}`);
    botActionTimers.set(gameId, { key, timer, deadline });
  }

  type MovementPresentation = { matchId: string; diceRollId: number; acknowledged: Set<string> };
  const movementPresentations = new Map<string, MovementPresentation>();

  function syncMovementPresentation(state: GameState): void {
    if (state.turnPhase !== 'MOVING' || state.phase !== 'PLAYING') {
      movementPresentations.delete(state.id);
      return;
    }
    const previous = movementPresentations.get(state.id);
    if (previous?.matchId === state.dbGameId && previous.diceRollId === state.diceRollId) return;
    movementPresentations.set(state.id, { matchId: state.dbGameId, diceRollId: state.diceRollId, acknowledged: new Set() });
  }

  /** One readiness signal per seated account, including observers of a bot roll. */
  function connectedMovementViewers(io: Server, state: GameState): Set<string> {
    const accounts = new Set(state.players.filter((player) => !player.isBot && !player.isBankrupt).map((player) => player.playerId));
    const required = new Set<string>();
    for (const socketId of io.sockets.adapter.rooms.get(getSocketRoom(state.id)) ?? []) {
      const account = io.sockets.sockets.get(socketId)?.data?.player?.id;
      if (typeof account === 'string' && accounts.has(account)) required.add(account);
    }
    return required;
  }

  /** The existing MOVING deadline is the bounded escape if a viewer never replies. */
  function completeMovementIfReady(io: Server, gameId: string): boolean {
    const state = gameService.getGameSync(gameId);
    if (!state || state.turnPhase !== 'MOVING') return false;
    const pending = movementPresentations.get(gameId);
    if (!pending || pending.matchId !== state.dbGameId || pending.diceRollId !== state.diceRollId) return false;
    const required = connectedMovementViewers(io, state);
    if (required.size === 0 || [...required].some((account) => !pending.acknowledged.has(account))) return false;
    movementPresentations.delete(gameId);
    advanceServerPhases(io, gameId, getSocketRoom(gameId), true);
    return true;
  }

  // ============================================
  // Socket wiring
  // ============================================

  const registerGameHandlers = (
    io: Server,
    socket: Socket,
    presence: SocketPresence = defaultPresence
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

      const challengeId = gameService.getGameSync(gameId)?.currentChallenge?.id;
      const outcome = action(gameId);
      if (!outcome) {
        if (opts.errorMessage) socket.emit('game:error', { message: opts.errorMessage });
        return;
      }

      const socketRoom = getSocketRoom(gameId);
      emitAnswerResult(io, socketRoom, outcome.state, outcome.result, challengeId);
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
        reply(false, 'A hint is available only while your unanswered question is active.');
        return;
      }
      socket.emit('game:challenge', { challenge: toPublicChallenge(outcome.challenge), playerId: seat.id });
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
      syncMovementPresentation(state);
      movementPresentations.get(data.gameId)!.acknowledged.add(playerId);
      completeMovementIfReady(io, data.gameId);
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

    socket.on('game:end-turn', (d: { gameId: string }) => {
      if (!validateTurn(d.gameId)) return;
      void handleEndTurnFlow(io, d.gameId);
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
      if (presence.disconnect(playerId, socket.id) > 0) return;

      const gameId: string | undefined = socket.data.gameId;
      if (!gameId) return;
      completeMovementIfReady(io, gameId);

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


  return {
    register: registerGameHandlers,
    publishStart: publishGameStartTransition,
    resume(io: Server): void {
      for (const state of gameService.listGames()) {
        if (state.phase === 'FINISHED') {
          scheduleCleanup(state.id);
          continue;
        }
        if (state.phase !== 'PLAYING') continue;
        syncMovementPresentation(state);
        armPhaseTimer(io, state.id);
        scheduleBotDuelAnswer(io, state.id);
        void triggerBotTurnIfNeeded(io, state.id);
        advanceServerPhases(io, state.id, getSocketRoom(state.id));
      }
    },
    snapshot(): GameHandlersSnapshot {
      const botActions = new Map(restoredBotActions);
      for (const [gameId, pending] of botActionTimers) botActions.set(gameId, { key: pending.key, deadline: pending.deadline });
      const botDuels = new Map(restoredBotDuels);
      for (const [gameId, pending] of botDuelTimers) botDuels.set(gameId, { duelId: pending.duelId, deadline: pending.deadline });
      const cleanup = new Map(restoredCleanup);
      for (const [gameId, pending] of cleanupTimers) cleanup.set(gameId, pending.deadline);
      return {
        botActions: [...botActions].map(([gameId, pending]) => ({ gameId, ...pending })),
        botDuels: [...botDuels].map(([gameId, pending]) => ({ gameId, ...pending })),
        cleanup: [...cleanup].map(([gameId, deadline]) => ({ gameId, deadline })),
        movements: [...movementPresentations].map(([gameId, pending]) => ({
          gameId, matchId: pending.matchId, diceRollId: pending.diceRollId,
          acknowledged: [...pending.acknowledged],
        })),
      };
    },
    restore(snapshot: GameHandlersSnapshot): void {
      phaseTimers.clearAll();
      for (const pending of botActionTimers.values()) scheduler.clearTimeout(pending.timer);
      for (const pending of botDuelTimers.values()) scheduler.clearTimeout(pending.timer);
      for (const pending of cleanupTimers.values()) scheduler.clearTimeout(pending.timer);
      botActionTimers.clear(); botDuelTimers.clear(); cleanupTimers.clear();
      restoredBotActions.clear(); restoredBotDuels.clear(); restoredCleanup.clear(); movementPresentations.clear();
      for (const { gameId, key, deadline } of snapshot.botActions) restoredBotActions.set(gameId, { key, deadline });
      for (const { gameId, duelId, deadline } of snapshot.botDuels) restoredBotDuels.set(gameId, { duelId, deadline });
      for (const { gameId, deadline } of snapshot.cleanup) restoredCleanup.set(gameId, deadline);
      for (const { gameId, matchId, diceRollId, acknowledged } of snapshot.movements) {
        movementPresentations.set(gameId, { matchId, diceRollId, acknowledged: new Set(acknowledged) });
      }
    },
  };
}

export type GameHandlersRuntime = ReturnType<typeof createGameHandlersRuntime>;
