// ============================================
// Game room runtime: timers, bots and turn advancement
// Turn flow: Roll (or jail choice) → Move → Resolve → Buy/Duel/Card → Build → End
// Learner commands live in game.socket.handlers.ts; result messages in
// game.emitters.ts.
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
import type { FinalScore, GameState } from '../features/game/game.types';
import { getCurrentPlayer, nextDuelDeadline } from '../features/game/game.engine';
import { getBotActionDelay, isBotControlled } from '../features/game/bot.engine';
import { publishFinishedToSocket, publishGameState, toPublicDuelState } from './game.publisher';
import { canBuildOnEndTurn, getPhaseDeadline, PHASE_TIMEOUTS, PhaseTimerRegistry } from './phase.deadlines';
import { SocketPresence } from './presence.manager';
import { emitAnswerResult, emitDuelResult, emitTimedOutDuelAnswerResults } from './game.emitters';
import { registerGameSocketHandlers, type GameTable } from './game.socket.handlers';

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
  /** Learners offline past reconnect grace are handed to a bot. Absent in older snapshots. */
  away?: Array<{ gameId: string; playerId: string; deadline: number }>;
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
  const awayTimers = new Map<string, { gameId: string; playerId: string; timer: unknown; deadline: number }>();
  const restoredAway = new Map<string, { gameId: string; playerId: string; deadline: number }>();

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

  /**
   * Starts a freshly created game on the same deadline-managed publication path
   * as later turns. The first turn waits for the boards: bots used to roll while
   * every learner's screen was still loading the table.
   */
  function publishGameStartTransition(io: Server, state: GameState): void {
    const live = gameService.getGameSync(state.id) ?? state;
    // `null` means the opening already finished; a repeated start keeps the table as it is.
    if (live.opening !== undefined || live.diceRollId !== 0) {
      broadcastState(io, getSocketRoom(state.id), live);
      return;
    }
    const opening = { readyPlayerIds: [], waitUntil: Date.now() + PHASE_TIMEOUTS.openingWait, beginsAt: null };
    broadcastState(io, getSocketRoom(state.id), gameService.replaceState(state.id, { ...live, opening }));
  }

  /** Learners the opening waits for; bots and away seats are always ready. */
  function openingIsReady(state: GameState): boolean {
    const ready = new Set(state.opening?.readyPlayerIds ?? []);
    return state.players.every((seat) => seat.isBot || seat.isBankrupt || seat.autopilot || ready.has(seat.playerId));
  }

  /** Shows the opening banner, or after it, hands the table its first turn. */
  function advanceOpening(io: Server, gameId: string, readyAccount?: string): void {
    const state = gameService.getGameSync(gameId);
    const opening = state?.opening;
    if (!state || !opening) return;
    let next: GameState;
    if (opening.beginsAt === null) {
      const readyPlayerIds = readyAccount && !opening.readyPlayerIds.includes(readyAccount)
        ? [...opening.readyPlayerIds, readyAccount]
        : opening.readyPlayerIds;
      const waiting = { ...state, opening: { ...opening, readyPlayerIds } };
      const begin = openingIsReady(waiting) || Date.now() >= opening.waitUntil;
      if (!begin && readyPlayerIds === opening.readyPlayerIds) return;
      next = begin
        ? { ...waiting, opening: { ...waiting.opening, beginsAt: Date.now() + PHASE_TIMEOUTS.openingBanner } }
        : waiting;
    } else {
      if (readyAccount) return;
      next = { ...state, opening: null };
    }
    broadcastState(io, getSocketRoom(gameId), gameService.replaceState(gameId, next));
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
      return isBotControlled(state.players.find((p) => p.id === side.playerId));
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
      // Release the finished lobby too. It used to stay "playing" forever, so
      // its room record was never removed from durable storage.
      const room = options.roomManager?.getRoom(gameId.replace(/^game_/, ''));
      for (const seat of [...(room?.players.values() ?? [])]) {
        if (!seat.isBot) options.roomManager!.removePlayer(seat.id);
      }
    }, Math.max(0, deadline - Date.now()), `cleanup:${gameId}`);
    cleanupTimers.set(gameId, { timer, deadline });
  }

  // ---- Phase deadlines ----

  function clearPhaseTimer(gameId: string) {
    phaseTimers.clear(gameId);
  }

  /**
   * A correct Math Escape (or a final jail-turn release) rolls in the same step
   * that grades the answer. The learner reads the answer card before the board
   * presents that roll, so its movement fallback starts after the card's hold.
   * An answer that ends in End Turn gets the same allowance.
   */
  function allowAnswerReview(gameId: string, state: GameState): void {
    if (isBotControlled(getCurrentPlayer(state))) return;
    // The End Turn window likewise opens only once the answer card has closed.
    const window = state.turnPhase === 'MOVING' ? PHASE_TIMEOUTS.movementFallback
      : state.turnPhase === 'END_TURN'
        ? canBuildOnEndTurn(state) ? PHASE_TIMEOUTS.build : PHASE_TIMEOUTS.endTurn
        : null;
    if (window === null) return;
    savePhaseDeadline(gameId, state, Date.now() + PHASE_TIMEOUTS.answerReview + window);
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

    // Before the first turn no countdown is shown; only the opening runs.
    if (state.opening) {
      savePhaseDeadline(gameId, state, null);
      const at = state.opening.beginsAt ?? state.opening.waitUntil;
      phaseTimers.arm(io, gameId, at, () => advanceOpening(io, gameId));
      return;
    }

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
    const normalDeadline = savedDeadline ?? getPhaseDeadline(state, now, { canBuild: canBuildOnEndTurn(state) });
    // An override only ever extends the phase; it never cuts remaining time short.
    const phaseDeadline = overrideMs === undefined
      ? normalDeadline
      : Math.max(now + overrideMs, normalDeadline ?? 0);

    if (phaseDeadline !== null) {
      savePhaseDeadline(gameId, state, phaseDeadline);
      phaseTimers.arm(io, gameId, phaseDeadline, () => void resolveStall(io, gameId));
      return;
    }

    // Bot turns normally run to completion, but errors or edge cases can
    // leave a bot stranded. Arm a generous safety timer so `resolveStall`
    // can push the turn forward if `triggerBotTurnIfNeeded` fails.
    if (isBotControlled(state.players[state.currentPlayerIndex])) {
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
      allowAnswerReview(gameId, outcome.state);
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

  // ---- Away learners ----
  //
  // A learner who closes the tab used to keep their seat, so every one of their
  // turns ran its full timeouts and every timeout was saved as their answer.
  // After the reconnect grace a bot plays the seat instead; nothing it answers
  // is recorded as the learner's evidence, and reconnecting hands it back.

  function awayKey(gameId: string, accountId: string): string {
    return `${gameId}|${accountId}`;
  }

  function cancelAway(gameId: string, accountId: string): void {
    const key = awayKey(gameId, accountId);
    const pending = awayTimers.get(key);
    if (pending) scheduler.clearTimeout(pending.timer);
    awayTimers.delete(key);
    restoredAway.delete(key);
  }

  function setAutopilot(io: Server, gameId: string, accountId: string, enabled: boolean): void {
    const state = gameService.setAutopilot(gameId, accountId, enabled);
    if (state) publishTransition(io, gameId, getSocketRoom(gameId), state);
    // A learner who left before the start no longer holds the opening.
    if (state?.opening) advanceOpening(io, gameId);
  }

  function scheduleAway(
    io: Server,
    gameId: string,
    accountId: string,
    deadline: number = Date.now() + PHASE_TIMEOUTS.disconnectGrace,
    presence: SocketPresence = defaultPresence
  ): void {
    cancelAway(gameId, accountId);
    const key = awayKey(gameId, accountId);
    const timer = scheduler.setTimeout(() => {
      awayTimers.delete(key);
      if (presence.count(accountId) > 0) return;
      setAutopilot(io, gameId, accountId, true);
    }, Math.max(0, deadline - Date.now()), `away:${key}`);
    awayTimers.set(key, { gameId, playerId: accountId, timer, deadline });
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
    const delay = state && !state.opening ? getBotActionDelay(state) : null;
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

  /**
   * Once the leading viewer has seen the move finish (the rolling learner, or
   * any viewer of a bot-played turn), slower screens get this long to catch up
   * before the table continues. One hidden tab or slow laptop used to hold
   * every roll until the 12-second fallback.
   */
  const MOVEMENT_FOLLOWER_GRACE_MS = 1_500;
  const movementGraceTimers = new Map<string, { diceRollId: number; timer: unknown }>();

  function clearMovementGrace(gameId: string): void {
    const pending = movementGraceTimers.get(gameId);
    if (pending) scheduler.clearTimeout(pending.timer);
    movementGraceTimers.delete(gameId);
  }

  function startMovementGraceIfLead(io: Server, gameId: string, accountId: string): void {
    const state = gameService.getGameSync(gameId);
    if (!state || state.turnPhase !== 'MOVING') return;
    const mover = getCurrentPlayer(state);
    const isLead = isBotControlled(mover) || mover.playerId === accountId;
    if (!isLead || movementGraceTimers.get(gameId)?.diceRollId === state.diceRollId) return;
    clearMovementGrace(gameId);
    const diceRollId = state.diceRollId;
    const timer = scheduler.setTimeout(() => {
      movementGraceTimers.delete(gameId);
      const live = gameService.getGameSync(gameId);
      if (!live || live.turnPhase !== 'MOVING' || live.diceRollId !== diceRollId) return;
      movementPresentations.delete(gameId);
      advanceServerPhases(io, gameId, getSocketRoom(gameId), true);
    }, MOVEMENT_FOLLOWER_GRACE_MS, `movement-grace:${gameId}`);
    movementGraceTimers.set(gameId, { diceRollId, timer });
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
    clearMovementGrace(gameId);
    advanceServerPhases(io, gameId, getSocketRoom(gameId), true);
    return true;
  }

  // ---- Learner commands ----

  /** Records that this learner's screen finished presenting the current roll. */
  function acknowledgeMovement(io: Server, state: GameState, accountId: string): void {
    syncMovementPresentation(state);
    movementPresentations.get(state.id)!.acknowledged.add(accountId);
    if (!completeMovementIfReady(io, state.id)) startMovementGraceIfLead(io, state.id, accountId);
  }

  const table: GameTable = {
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
  };

  const registerGameHandlers = (io: Server, socket: Socket, presence: SocketPresence = defaultPresence) =>
    registerGameSocketHandlers(table, io, socket, presence);

  return {
    register: registerGameHandlers,
    publishStart: publishGameStartTransition,
    resume(io: Server): void {
      for (const pending of [...restoredAway.values()]) {
        const state = gameService.getGameSync(pending.gameId);
        if (!state || state.phase !== 'PLAYING' || defaultPresence.count(pending.playerId) > 0) {
          cancelAway(pending.gameId, pending.playerId);
          continue;
        }
        scheduleAway(io, pending.gameId, pending.playerId, pending.deadline);
      }
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
      const away = new Map(restoredAway);
      for (const [key, pending] of awayTimers) away.set(key, { gameId: pending.gameId, playerId: pending.playerId, deadline: pending.deadline });
      return {
        botActions: [...botActions].map(([gameId, pending]) => ({ gameId, ...pending })),
        botDuels: [...botDuels].map(([gameId, pending]) => ({ gameId, ...pending })),
        cleanup: [...cleanup].map(([gameId, deadline]) => ({ gameId, deadline })),
        movements: [...movementPresentations].map(([gameId, pending]) => ({
          gameId, matchId: pending.matchId, diceRollId: pending.diceRollId,
          acknowledged: [...pending.acknowledged],
        })),
        away: [...away.values()],
      };
    },
    restore(snapshot: GameHandlersSnapshot): void {
      phaseTimers.clearAll();
      for (const pending of botActionTimers.values()) scheduler.clearTimeout(pending.timer);
      for (const pending of botDuelTimers.values()) scheduler.clearTimeout(pending.timer);
      for (const pending of cleanupTimers.values()) scheduler.clearTimeout(pending.timer);
      for (const pending of awayTimers.values()) scheduler.clearTimeout(pending.timer);
      botActionTimers.clear(); botDuelTimers.clear(); cleanupTimers.clear(); awayTimers.clear();
      restoredBotActions.clear(); restoredBotDuels.clear(); restoredCleanup.clear(); movementPresentations.clear();
      restoredAway.clear();
      for (const pending of snapshot.away ?? []) restoredAway.set(awayKey(pending.gameId, pending.playerId), { ...pending });
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
