# Runtime and Networking Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server state publication, turn timing, movement, reconnection, lobby presence, finished-game recovery, and bot playback authoritative and race-safe.

**Architecture:** Add explicit public-state and publication modules so every socket path uses the same deny-by-default contract. Extract phase deadlines and presence tracking into testable modules, gate tile resolution on a bounded movement acknowledgement, and commit bot snapshots in presentation order instead of precommitting the final state.

**Tech Stack:** TypeScript 6, Node.js, Express, Socket.IO 4, Jest 30, React 19, socket.io-client.

## Global Constraints

- Work on branch `monopoly-game-improve` from the approved design commit.
- Preserve the property-trading game structure, scoring, rounds, active math events, and server-authoritative rules.
- Question time never begins during dice or pawn animation.
- Waiting to roll is 45 seconds; property purchase is 20 seconds; build-capable end turn is 30 seconds; ordinary end turn is 10 seconds.
- No public socket payload may expose answers, mastery maps, attempt counters, failure counters, or another learner's report.
- Multiple sockets for one player count as one connected player; closing one tab cannot start recovery while another remains.
- Existing untracked proposal, QA, temporary, and prototype files stay untouched.
- Use `apply_patch` for source edits and make one focused commit after each task passes.

---

## File Structure

- Create `backend/src/features/game/game.public.ts`: explicit `PublicGameState`/player projection.
- Create `backend/src/sockets/game.publisher.ts`: room and per-socket publication, challenge/duel/finished privacy.
- Create `backend/src/sockets/phase.deadlines.ts`: phase timeout selection and timer registry.
- Create `backend/src/sockets/presence.manager.ts`: socket-counted player presence.
- Create `backend/src/sockets/__tests__/game.publisher.test.ts`.
- Create `backend/src/sockets/__tests__/phase.deadlines.test.ts`.
- Create `backend/src/sockets/__tests__/presence.manager.test.ts`.
- Create `backend/src/test/game.fixtures.ts`: deterministic game/challenge/finished fixtures.
- Create `backend/src/sockets/__tests__/socket.harness.ts`: typed fake Socket.IO emitter harness.
- Modify `backend/src/features/game/game.types.ts`: public contracts and movement timestamp.
- Modify `backend/src/features/game/game.service.ts`: safe movement fallback, per-player finished report, ordered bot-step commit.
- Modify `backend/src/sockets/game.handlers.ts`: delegate publication/deadlines and accept movement acknowledgement.
- Modify `backend/src/sockets/lobby.handlers.ts`: idempotent start and reconnect-aware leave.
- Modify `backend/src/sockets/lobby.manager.ts`: atomic start state and room resume.
- Modify `backend/src/sockets/index.ts`: shared presence registration.
- Modify `frontend/src/features/game/hooks/useGameSocket.ts`: movement-complete event and recovered finished payload.
- Modify `frontend/src/features/game/pages/GamePage.tsx`: emit movement acknowledgement once per roll.
- Modify existing backend game/lobby recovery tests as named below.

### Task 1: Explicit Public Game Contract and Shared Publisher

**Files:**
- Create: `backend/src/features/game/game.public.ts`
- Create: `backend/src/sockets/game.publisher.ts`
- Create: `backend/src/sockets/__tests__/game.publisher.test.ts`
- Create: `backend/src/test/game.fixtures.ts`
- Create: `backend/src/sockets/__tests__/socket.harness.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `backend/src/sockets/lobby.handlers.ts`

**Interfaces:**
- Produces: `toPublicGameState(state: GameState): PublicGameState`.
- Produces: `publishGameState(io: Server, state: GameState): void`.
- Produces: `publishGameStateToSocket(socket: Socket, state: GameState): void`.
- Produces: `publishFinishedToSocket(socket: Socket, state: GameState, scores: FinalScore[], report: MasteryReport | null): void`.
- Produces test helpers `makeGameState(overrides?)`, `makePrivateChallenge(overrides?)`, `makeFinishedFixture()`, and `makeSocket(playerId)` used by later plan tests.
- Consumes later: every lobby, reconnect, normal transition, bot transition, and finished-game path.

- [ ] **Step 1: Write failing deny-by-default projection tests**

```ts
it('projects only public player and game fields', () => {
  const state = makeGameState();
  state.players[0].masteryStates = { Addition: 0.91 };
  state.players[0].skillAttempts = { Addition: 8 };
  state.players[0].consecutiveFailures = { Addition: 2 };
  state.currentChallenge = makePrivateChallenge({ correctIndex: 2 });

  const publicState = toPublicGameState(state);

  expect(publicState.players[0]).not.toHaveProperty('masteryStates');
  expect(publicState.players[0]).not.toHaveProperty('skillAttempts');
  expect(publicState.players[0]).not.toHaveProperty('consecutiveFailures');
  expect(publicState).not.toHaveProperty('currentChallenge');
  expect(JSON.stringify(publicState)).not.toContain('correctIndex');
});

it('sends only the requesting learner report in a finished payload', () => {
  const socket = makeSocket({ player: { id: 'db-player-1' } });
  publishFinishedToSocket(socket, finishedState, scores, reportForPlayerOne);
  expect(socket.emit).toHaveBeenCalledWith('game:finished', {
    scores,
    masteryReport: reportForPlayerOne,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/game.publisher.test.ts --runInBand`

Expected: FAIL because `game.public.ts` and `game.publisher.ts` do not exist.

- [ ] **Step 3: Define explicit public types and projection**

```ts
export type PublicPlayerState = Pick<PlayerState,
  | 'id' | 'playerId' | 'name' | 'position' | 'money' | 'color' | 'tokenType'
  | 'properties' | 'isInJail' | 'jailTurns' | 'isBankrupt' | 'streak'
  | 'totalCorrect' | 'totalQuestions' | 'hasLevelUpToken' | 'hasRentShield'
  | 'hasDiscountToken' | 'isBot' | 'botDifficulty'
>;

export interface PublicGameState {
  id: string;
  players: PublicPlayerState[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  phase: GameState['phase'];
  turnPhase: TurnPhase;
  round: number;
  maxRounds: number;
  diceValues: [number, number];
  diceRollId: number;
  diceCount: 1 | 2;
  duelState: null;
  pendingTileEvent: TileEvent | null;
  gameStartTime: number;
  isFinalRound: boolean;
  phaseDeadline: number | null;
}
```

Implement `toPublicGameState` by constructing every property explicitly. Do not use `{ ...state }` or `{ ...player }`. Move challenge and duel recipient logic from `game.handlers.ts` into `game.publisher.ts`, and make lobby start call `publishGameState` instead of emitting a locally redacted spread.

- [ ] **Step 4: Run public-contract and existing redaction tests**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/game.publisher.test.ts backend/src/features/game/__tests__/challenge.public.test.ts --runInBand`

Expected: PASS with no serialized answer or mastery field.

- [ ] **Step 5: Commit the public contract**

```bash
git add backend/src/features/game/game.public.ts backend/src/features/game/game.types.ts backend/src/sockets/game.publisher.ts backend/src/sockets/game.handlers.ts backend/src/sockets/lobby.handlers.ts backend/src/sockets/__tests__/game.publisher.test.ts backend/src/sockets/__tests__/socket.harness.ts backend/src/test/game.fixtures.ts
git commit -m "fix: centralize safe game state publication"
```

### Task 2: Movement Acknowledgement and Phase-Specific Deadlines

**Files:**
- Create: `backend/src/sockets/phase.deadlines.ts`
- Create: `backend/src/sockets/__tests__/phase.deadlines.test.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `frontend/src/features/game/hooks/useGameSocket.ts`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `backend/src/features/game/__tests__/stall.recovery.test.ts`

**Interfaces:**
- Produces: `PHASE_TIMEOUTS` with `ROLL_PHASE`, `BUY_DECISION`, build-capable `END_TURN`, ordinary `END_TURN`, and `MOVING` fallback durations.
- Produces: `getPhaseDeadline(state: GameState, now: number, options: { canBuild: boolean }): number | null` returning an absolute Unix-millisecond deadline.
- Produces: `PhaseTimerRegistry.arm(io: Server, gameId: string, deadline: number, onExpire: () => void): void`.
- Produces: client event `game:movement-complete` payload `{ gameId: string; diceRollId: number }`.

- [ ] **Step 1: Write failing deadline and movement-fallback tests**

```ts
it.each([
  ['ROLL_PHASE', false, 45_000],
  ['BUY_DECISION', false, 20_000],
  ['END_TURN', false, 10_000],
  ['END_TURN', true, 30_000],
  ['MOVING', false, 12_000],
] as const)('uses the approved %s deadline', (phase, canBuild, expected) => {
  const state = makeGameState({ turnPhase: phase });
  expect(getPhaseDeadline(state, NOW, { canBuild })).toBe(NOW + expected);
});

it('advances MOVING when the presentation fallback expires', () => {
  const state = gameService.startRoll(gameId)!;
  expect(state.turnPhase).toBe('MOVING');
  const outcome = gameService.resolveStalledTurn(gameId);
  expect(outcome?.state.turnPhase).not.toBe('MOVING');
});
```

- [ ] **Step 2: Run the tests and verify the old behavior fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/phase.deadlines.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Expected: FAIL because `MOVING` currently has no timer and `resolveStalledTurn` returns `null`.

- [ ] **Step 3: Implement deadline selection and the movement handshake**

```ts
export const PHASE_TIMEOUTS = {
  roll: 45_000,
  buy: 20_000,
  build: 30_000,
  endTurn: 10_000,
  movementFallback: 12_000,
  disconnectGrace: 60_000,
} as const;

socket.on('game:movement-complete', ({ gameId, diceRollId }) => {
  const state = validateTurn(gameId);
  if (!state || state.turnPhase !== 'MOVING' || state.diceRollId !== diceRollId) return;
  advanceServerPhases(io, gameId, getSocketRoom(gameId));
});
```

Change `game:roll` to publish the `MOVING` state without immediately calling `advanceServerPhases`. Store the absolute phase deadline in the public state, arm the 12-second server fallback, and make duplicate/stale acknowledgements no-ops. Have `GamePage.handleMovementComplete` emit the acknowledgement exactly once for the current `diceRollId`.

- [ ] **Step 4: Run the focused tests and typechecks**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/phase.deadlines.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: all commands PASS.

- [ ] **Step 5: Commit movement and deadlines**

```bash
git add backend/src/sockets/phase.deadlines.ts backend/src/sockets/__tests__/phase.deadlines.test.ts backend/src/features/game/game.types.ts backend/src/features/game/game.service.ts backend/src/features/game/__tests__/stall.recovery.test.ts backend/src/sockets/game.handlers.ts frontend/src/features/game/hooks/useGameSocket.ts frontend/src/features/game/pages/GamePage.tsx
git commit -m "fix: synchronize movement and phase deadlines"
```

### Task 3: Idempotent Start and Multi-Socket Lobby Presence

**Files:**
- Create: `backend/src/sockets/presence.manager.ts`
- Create: `backend/src/sockets/__tests__/presence.manager.test.ts`
- Create: `backend/src/sockets/__tests__/lobby.start.test.ts`
- Modify: `backend/src/sockets/index.ts`
- Modify: `backend/src/sockets/lobby.manager.ts`
- Modify: `backend/src/sockets/lobby.handlers.ts`
- Modify: `backend/src/sockets/game.handlers.ts`

**Interfaces:**
- Produces: `SocketPresence.connect(playerId: string, socketId: string): void`.
- Produces: `SocketPresence.disconnect(playerId: string, socketId: string): number` returning remaining socket count.
- Produces: `Room.status` union `'waiting' | 'starting' | 'playing'`.
- Produces: `roomManager.beginStart(code: string, requesterId: string): Room | null` as an atomic waiting-to-starting transition.
- Produces: `roomManager.cancelStart(code: string): void` for failed game creation.

- [ ] **Step 1: Write failing presence and duplicate-start tests**

```ts
it('keeps a player connected until the final socket closes', () => {
  const presence = new SocketPresence();
  presence.connect('p1', 's1');
  presence.connect('p1', 's2');
  expect(presence.disconnect('p1', 's1')).toBe(1);
  expect(presence.disconnect('p1', 's2')).toBe(0);
});

it('allows only one start transition', () => {
  const room = readyRoom();
  expect(manager.beginStart(room.code, room.hostId)).not.toBeNull();
  expect(manager.beginStart(room.code, room.hostId)).toBeNull();
});
```

- [ ] **Step 2: Run tests and confirm the missing abstractions fail**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/presence.manager.test.ts backend/src/sockets/__tests__/lobby.start.test.ts --runInBand`

Expected: FAIL because `SocketPresence`, `starting`, and `beginStart` do not exist.

- [ ] **Step 3: Implement shared presence and atomic room start**

```ts
export class SocketPresence {
  private readonly socketsByPlayer = new Map<string, Set<string>>();
  connect(playerId: string, socketId: string): void;
  disconnect(playerId: string, socketId: string): number;
  count(playerId: string): number;
}

public beginStart(code: string, requesterId: string): Room | null {
  const room = this.rooms.get(code);
  if (!room || room.hostId !== requesterId || room.status !== 'waiting' || !this.canStartGame(code)) return null;
  room.status = 'starting';
  return room;
}
```

Register presence once in `sockets/index.ts` and inject the same instance into lobby/game handlers. Only schedule lobby removal or active-turn disconnect recovery when `disconnect` returns zero. `room:start` must call `beginStart` before asynchronous game creation, set every room socket's `socket.data.gameId`, publish through `game.publisher.ts`, then mark the room `playing`; on creation failure call `cancelStart` and emit one error.

- [ ] **Step 4: Run presence/start tests and the existing game recovery suite**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/presence.manager.test.ts backend/src/sockets/__tests__/lobby.start.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Expected: PASS, including one `createGame` call for two rapid start events.

- [ ] **Step 5: Commit lobby/presence fixes**

```bash
git add backend/src/sockets/presence.manager.ts backend/src/sockets/__tests__/presence.manager.test.ts backend/src/sockets/__tests__/lobby.start.test.ts backend/src/sockets/index.ts backend/src/sockets/lobby.manager.ts backend/src/sockets/lobby.handlers.ts backend/src/sockets/game.handlers.ts
git commit -m "fix: make lobby presence and game start race-safe"
```

### Task 4: Lobby Resume, Duel Recovery, and Finished-Game Refresh

**Files:**
- Create: `backend/src/sockets/__tests__/reconnect.test.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/sockets/lobby.handlers.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `backend/src/sockets/game.publisher.ts`
- Modify: `frontend/src/features/game/components/GameLobby.tsx`
- Modify: `frontend/src/features/game/hooks/useGameSocket.ts`
- Modify: `frontend/src/features/game/hooks/useGameState.ts`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/features/game/types/game.types.ts`

**Interfaces:**
- Produces: lobby event `room:resume` payload `{ code: string }`.
- Produces: lobby event `room:removed` payload `{ code: string; message: string }`.
- Produces: `gameService.getMasteryReportForPlayer(gameId: string, dbPlayerId: string): MasteryReport | null`.
- Changes finished payload to `{ scores: FinalScore[]; masteryReport: MasteryReport | null }`.

- [ ] **Step 1: Write failing reconnect privacy tests**

```ts
it('re-emits the reconnecting duellist question', async () => {
  await requestState(ownerSocket, duelGame.id);
  expect(ownerSocket.emit).toHaveBeenCalledWith('game:duel', expect.objectContaining({
    myChallenge: expect.objectContaining({ id: duelGame.duelState!.owner.challenge.id }),
  }));
});

it('re-emits scores and only the viewer report for a finished game', async () => {
  await requestState(playerOneSocket, finishedGame.id);
  expect(playerOneSocket.emit).toHaveBeenCalledWith('game:finished', {
    scores: expect.any(Array),
    masteryReport: expect.objectContaining({ playerId: finishedGame.players[0].id }),
  });
  expect(JSON.stringify(playerOneSocket.emit.mock.calls)).not.toContain(finishedGame.players[1].masteryStates.Addition.toString());
});
```

- [ ] **Step 2: Run reconnect tests and confirm current gaps**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/reconnect.test.ts --runInBand`

Expected: FAIL because request-state does not emit duel or finished payloads and reports are not viewer-specific.

- [ ] **Step 3: Implement resume and personalized recovery**

```ts
getMasteryReportForPlayer(gameId: string, dbPlayerId: string): MasteryReport | null {
  const state = activeGames.get(gameId);
  const player = state?.players.find((candidate) => candidate.playerId === dbPlayerId && !candidate.isBot);
  return player ? generateMasteryReport(player) : null;
}
```

Make request-state call one publisher entry point that sends public state, the viewer's solo challenge, the viewer's duel side, and the finished payload when applicable. Add `room:resume`; it cancels pending lobby removal, rejoins the socket room, and emits the newest serialized room. If the seat no longer exists, emit `room:removed` and have `GameLobby` return to the landing page with a visible message.

- [ ] **Step 4: Run reconnect tests and frontend typecheck**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/reconnect.test.ts --runInBand`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS; no array of all mastery reports remains in the socket contract.

- [ ] **Step 5: Commit recovery behavior**

```bash
git add backend/src/sockets/__tests__/reconnect.test.ts backend/src/features/game/game.service.ts backend/src/sockets/lobby.handlers.ts backend/src/sockets/game.handlers.ts backend/src/sockets/game.publisher.ts frontend/src/features/game/components/GameLobby.tsx frontend/src/features/game/hooks/useGameSocket.ts frontend/src/features/game/hooks/useGameState.ts frontend/src/features/game/pages/GamePage.tsx frontend/src/features/game/types/game.types.ts
git commit -m "fix: restore authoritative state after reconnect"
```

### Task 5: Ordered Bot Playback

**Files:**
- Create: `backend/src/features/game/__tests__/bot.playback.test.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `backend/src/features/game/bot.engine.ts`

**Interfaces:**
- Produces: `gameService.planBotTurn(gameId: string): BotTurnStep[] | null`, which does not mutate `activeGames`.
- Produces: `gameService.commitBotStep(gameId: string, state: GameState): GameState`, called once per ordered presentation step.
- Removes: precommit behavior from `executeBotTurn` service wrapper.

- [ ] **Step 1: Write a failing playback-order regression test**

```ts
it('does not expose the final bot state before intermediate steps are presented', () => {
  const before = gameService.getGameSync(gameId)!;
  const steps = gameService.planBotTurn(gameId)!;
  expect(gameService.getGameSync(gameId)).toBe(before);

  for (const step of steps) {
    gameService.commitBotStep(gameId, step.state);
    expect(gameService.getGameSync(gameId)).toBe(step.state);
  }
});
```

- [ ] **Step 2: Run the bot test and verify it fails under precommit behavior**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/features/game/__tests__/bot.playback.test.ts --runInBand`

Expected: FAIL because the current service writes the last step before playback.

- [ ] **Step 3: Separate planning from committing**

```ts
planBotTurn(gameId: string): BotTurnStep[] | null {
  const state = activeGames.get(gameId);
  return state ? executeBotTurn(state) : null;
},
commitBotStep(gameId: string, state: GameState): GameState {
  activeGames.set(gameId, state);
  return state;
},
```

In `triggerBotTurnIfNeeded`, wait for each step's presentation delay, commit that step, publish it through `publishGameState`, and then emit `game:bot-action`. Re-read the committed state before deciding whether to recurse, wait for a human duel response, or finish.

- [ ] **Step 4: Run bot, duel, and stall suites**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/features/game/__tests__/bot.playback.test.ts backend/src/features/game/__tests__/duel.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Expected: PASS without a state regression during delayed playback.

- [ ] **Step 5: Commit ordered bot playback**

```bash
git add backend/src/features/game/__tests__/bot.playback.test.ts backend/src/features/game/game.service.ts backend/src/features/game/bot.engine.ts backend/src/sockets/game.handlers.ts
git commit -m "fix: publish bot turns in committed order"
```

### Task 6: Runtime Plan Verification

**Files:**
- Modify only if verification exposes a regression in files changed by Tasks 1–5.

**Interfaces:**
- Produces: a stable runtime/networking baseline consumed by the learning and frontend plans.

- [ ] **Step 1: Run the complete backend test suite**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs --runInBand`

Expected: all suites PASS.

- [ ] **Step 2: Run both TypeScript checks**

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: both commands exit zero.

- [ ] **Step 3: Inspect the runtime diff for unsafe spreads and stale raw emits**

Run: `git diff HEAD~5 -- backend/src/sockets backend/src/features/game/game.public.ts | Select-String -Pattern '\.\.\.state|\.\.\.player|emit\(''game:state'''`

Expected: state publication occurs through `game.publisher.ts`; projection contains no private spreads.

- [ ] **Step 4: Record the runtime checkpoint**

Run: `git status --short`

Expected: only the user's pre-existing untracked files remain; all runtime plan changes are committed.
