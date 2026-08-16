# Adaptive Learning and Rule Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the four-skill primary-math curriculum, improve adaptive selection and feedback, make timeout evidence honest, and remove auctions plus unreachable quiz-gated legacy paths.

**Architecture:** Keep the standard BKT update formula but improve the evidence entering it. Add semantic question fingerprints and per-player recent history, cap Division difficulty from prerequisite readiness without coupling mastery updates, and route submissions through a server-timed nullable-answer contract.

**Tech Stack:** TypeScript 6, Jest 30, Prisma 5/PostgreSQL, React 19, Socket.IO 4.

## Global Constraints

- Addition, Subtraction, Multiplication, and Division are active.
- Product wording is `Primary Math`, not `Standard 1 KSSR`.
- Easy/medium Division is exact; hard Division may use remainders.
- Division mastery is independent; Multiplication and Subtraction only affect readiness/difficulty.
- Easy, medium, and hard questions receive 25, 20, and 15 seconds respectively.
- A timeout is logged, receives no reward, counts as unanswered for accuracy, breaks a game streak, and does not change mastery or consecutive-failure scaffolding.
- Incorrect feedback is `Incorrect. Correct answer: X.` plus one concise worked step; no same-turn retry.
- Auctions are absent; declined property remains unowned.
- Direct property building/upgrading and level-up tokens remain active.
- The public-state contract from the runtime plan must remain deny-by-default.

---

## File Structure

- Create `backend/src/bkt/question.fingerprint.ts`: semantic fingerprint and bounded deduplication.
- Create `backend/src/bkt/feedback.ts`: concise worked feedback.
- Create tests beside existing BKT/game tests.
- Create `backend/src/test/bkt.fixtures.ts`: deterministic selector/generator test inputs.
- Modify `backend/src/features/game/game.constants.ts`: four skills, timing, Primary Math copy constant.
- Modify `backend/src/bkt/bkt.selector.ts`: exposure-aware selection, readiness cap, difficulty time.
- Modify `backend/src/bkt/question.generator.ts`: Division progression and price-context Smart Buy.
- Modify `backend/src/features/game/game.types.ts`: private recent history and nullable answer submission types.
- Modify `backend/src/features/game/game.engine.ts`: issue-history updates, timeout grading, auction/legacy removal.
- Modify `backend/src/features/game/game.service.ts`: server-timed submission and write-drain boundary.
- Modify `backend/src/features/game/game.persistence.ts`: timeout record and per-player drain.
- Modify `backend/src/sockets/game.handlers.ts`: validated answer payload without trusted `timeMs`.
- Modify frontend socket/types/page code to remove deleted events and show feedback.

### Task 1: Activate Four Skills, Primary-Math Copy, and Difficulty Timing

**Files:**
- Modify: `backend/src/features/game/game.constants.ts`
- Modify: `backend/src/bkt/bkt.selector.ts`
- Modify: `backend/src/bkt/__tests__/bkt.selector.test.ts`
- Modify: `backend/src/bkt/__tests__/selection.rebalance.test.ts`
- Modify: `frontend/src/features/game/types/game.types.ts`

**Interfaces:**
- Produces: `ACTIVE_SKILL_NAMES` equal to `SKILL_NAMES`.
- Produces: `QUESTION_TIME_LIMITS: Record<1 | 2 | 3, number>`.
- Produces: `PRIMARY_MATH_LABEL = 'Primary Math'`.
- Produces shared test helpers `baseInput(overrides?)`, `masteryFor(difficulty)`, `generatedAddition(a, b)`, `targetAnswer(data)`, `onUnownedProperty()`, `readyState()`, `buildableState(overrides?)`, and `currentPlayer(state)` in `backend/src/test/bkt.fixtures.ts`.

- [ ] **Step 1: Write failing four-skill and time-limit tests**

```ts
it('keeps every primary-math skill live', () => {
  expect(ACTIVE_SKILL_NAMES).toEqual(['Addition', 'Subtraction', 'Multiplication', 'Division']);
});

it.each([[1, 25], [2, 20], [3, 15]] as const)(
  'assigns difficulty %s a %s second answer window',
  (difficulty, seconds) => {
    const challenge = selectChallenge(baseInput({ forceSkill: 'Addition', mastery: masteryFor(difficulty) }));
    expect(challenge.difficulty).toBe(difficulty);
    expect(challenge.timeLimit).toBe(seconds);
  }
);
```

- [ ] **Step 2: Run selector tests and verify they fail**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/bkt.selector.test.ts backend/src/bkt/__tests__/selection.rebalance.test.ts --runInBand`

Expected: FAIL because only Addition/Subtraction are active and context-specific zero/15/20 timing remains.

- [ ] **Step 3: Implement the single live curriculum and timing table**

```ts
export const ACTIVE_SKILL_NAMES = SKILL_NAMES;
export const PRIMARY_MATH_LABEL = 'Primary Math';
export const QUESTION_TIME_LIMITS = { 1: 25, 2: 20, 3: 15 } as const;
```

Remove the dormant-generator override comments and set every generated challenge's `timeLimit` from `QUESTION_TIME_LIMITS[difficulty]`, including duel and Smart Buy challenges.

- [ ] **Step 4: Run all BKT tests**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__ --runInBand`

Expected: PASS with all four skills observed across a seeded/high-volume selector sample.

- [ ] **Step 5: Commit the active curriculum**

```bash
git add backend/src/features/game/game.constants.ts backend/src/bkt/bkt.selector.ts backend/src/bkt/__tests__/bkt.selector.test.ts backend/src/bkt/__tests__/selection.rebalance.test.ts backend/src/test/bkt.fixtures.ts frontend/src/features/game/types/game.types.ts
git commit -m "feat: activate the primary math curriculum"
```

### Task 2: Semantic Question Deduplication and Exposure Balance

**Files:**
- Create: `backend/src/bkt/question.fingerprint.ts`
- Create: `backend/src/bkt/__tests__/question.fingerprint.test.ts`
- Modify: `backend/src/bkt/bkt.selector.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/features/game/game.engine.ts`
- Modify: `backend/src/bkt/__tests__/selection.rebalance.test.ts`

**Interfaces:**
- Produces: `questionFingerprint(question: GeneratedQuestion): string`.
- Produces: `generateDistinctQuestion(generate: () => GeneratedQuestion, recent: readonly string[], maxAttempts?: number): GeneratedQuestion & { fingerprint: string }`.
- Adds private `PlayerState.recentQuestionFingerprints: string[]` capped at eight.
- Adds private `MathChallenge.fingerprint: string`, never included in `PublicMathChallenge`.

- [ ] **Step 1: Write failing equivalence and bounded-retry tests**

```ts
it('treats commutative addition variants as the same recent question', () => {
  expect(questionFingerprint(generatedAddition(7, 5))).toBe(questionFingerprint(generatedAddition(5, 7)));
});

it('retries a recent question but stops after the bound', () => {
  const generate = jest.fn().mockReturnValue(generatedAddition(7, 5));
  const result = generateDistinctQuestion(generate, [questionFingerprint(generatedAddition(5, 7))], 4);
  expect(generate).toHaveBeenCalledTimes(4);
  expect(result.fingerprint).toBe(questionFingerprint(result));
});
```

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/question.fingerprint.test.ts --runInBand`

Expected: FAIL because fingerprint helpers do not exist.

- [ ] **Step 3: Implement operation-aware fingerprints and history updates**

```ts
export function questionFingerprint(question: GeneratedQuestion): string {
  const data = question.questionData;
  if (data.type === 'column') {
    const operands = data.operation === '+' || data.operation === '×'
      ? [data.topNumber, data.bottomNumber].sort((a, b) => a - b)
      : [data.topNumber, data.bottomNumber];
    return ['column', data.operation, ...operands, data.missingPosition, data.missingDigitPlace ?? '-'].join(':');
  }
  if (data.type === 'long_division') {
    return ['division', data.dividend, data.divisor, data.missingTarget, data.missingStepIndex].join(':');
  }
  return ['mcq', data.text.trim().replace(/\s+/g, ' ')].join(':');
}
```

Pass the current player's recent fingerprints into `selectChallenge`, regenerate at most six times, attach the selected fingerprint privately, and update the issued player's window when the challenge/duel side is created—not when it is answered.

- [ ] **Step 4: Run fingerprint, selector, duel, and public-redaction tests**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/question.fingerprint.test.ts backend/src/bkt/__tests__/selection.rebalance.test.ts backend/src/features/game/__tests__/duel.test.ts backend/src/sockets/__tests__/game.publisher.test.ts --runInBand`

Expected: PASS and no fingerprint in serialized public state.

- [ ] **Step 5: Commit recent-question control**

```bash
git add backend/src/bkt/question.fingerprint.ts backend/src/bkt/__tests__/question.fingerprint.test.ts backend/src/bkt/bkt.selector.ts backend/src/features/game/game.types.ts backend/src/features/game/game.engine.ts backend/src/bkt/__tests__/selection.rebalance.test.ts
git commit -m "feat: prevent repetitive math questions"
```

### Task 3: Division Readiness, Remainder Progression, and Price Context

**Files:**
- Modify: `backend/src/bkt/bkt.selector.ts`
- Modify: `backend/src/bkt/question.generator.ts`
- Modify: `backend/src/bkt/__tests__/question.generator.test.ts`
- Modify: `backend/src/bkt/__tests__/pedagogy.test.ts`

**Interfaces:**
- Produces: `capDivisionDifficulty(difficulty, masteryStates, skillAttempts): 1 | 2 | 3`.
- Changes: `generateSmartBuyQuestion(propertyPrice, difficulty, targetSkill)` must use `propertyPrice` in operands/text.

- [ ] **Step 1: Write failing curriculum progression tests**

```ts
it.each([1, 2] as const)('generates exact division at difficulty %s', (difficulty) => {
  for (let i = 0; i < 500; i += 1) {
    const q = generateQuestion('Division', difficulty).questionData;
    expect(q.type).toBe('long_division');
    if (q.type === 'long_division') expect(q.remainder).toBe(0);
  }
});

it('caps division when multiplication or subtraction evidence is weak', () => {
  expect(capDivisionDifficulty(3, {
    Division: 0.9, Multiplication: 0.2, Subtraction: 0.9, Addition: 0.9,
  }, { Division: 10, Multiplication: 1, Subtraction: 10, Addition: 10 })).toBe(1);
});

it('uses the landed property price in Smart Buy', () => {
  const q = generateSmartBuyQuestion(240, 2, 'Subtraction');
  expect(q.text).toContain('240');
});
```

- [ ] **Step 2: Run generator/pedagogy tests and verify the Smart Buy test fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/question.generator.test.ts backend/src/bkt/__tests__/pedagogy.test.ts --runInBand`

Expected: FAIL because Smart Buy ignores `propertyPrice` and prerequisite capping is absent.

- [ ] **Step 3: Implement readiness and contextual generation**

```ts
export function capDivisionDifficulty(
  proposed: 1 | 2 | 3,
  mastery: Record<string, number>,
  attempts: Record<string, number>
): 1 | 2 | 3 {
  const prerequisite = Math.min(mastery.Multiplication ?? INITIAL_MASTERY, mastery.Subtraction ?? INITIAL_MASTERY);
  const evidence = Math.min(attempts.Multiplication ?? 0, attempts.Subtraction ?? 0);
  if (prerequisite < 0.35 || evidence < 2) return 1;
  if (prerequisite < 0.65 || evidence < 5) return Math.min(proposed, 2) as 1 | 2;
  return proposed;
}
```

Apply the cap only after Division is selected. Keep easy/medium dividend construction exact and allow remainder targets only in hard generation. Build Smart Buy operands directly from `propertyPrice` and the active discount/price calculation instead of calling the generic generator unchanged.

- [ ] **Step 4: Run the 24,000-question stress check and focused tests**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/question.generator.test.ts backend/src/bkt/__tests__/pedagogy.test.ts --runInBand`

Expected: PASS with valid unique options, balanced correct indices, exact easy/medium Division, and hard remainder coverage.

- [ ] **Step 5: Commit curriculum progression**

```bash
git add backend/src/bkt/bkt.selector.ts backend/src/bkt/question.generator.ts backend/src/bkt/__tests__/question.generator.test.ts backend/src/bkt/__tests__/pedagogy.test.ts
git commit -m "feat: improve division and contextual questions"
```

### Task 4: Honest Timeout Evidence and Server-Timed Submissions

**Files:**
- Create: `backend/src/bkt/feedback.ts`
- Create: `backend/src/bkt/__tests__/feedback.test.ts`
- Create: `backend/src/sockets/answer.validation.ts`
- Create: `backend/src/sockets/__tests__/answer.validation.test.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/features/game/game.engine.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/features/game/game.persistence.ts`
- Modify: `backend/src/features/game/__tests__/persistence.test.ts`
- Modify: `backend/src/features/game/__tests__/stall.recovery.test.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `frontend/src/features/game/hooks/useGameSocket.ts`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/features/game/types/game.types.ts`

**Interfaces:**
- Produces: `submitAnswer(gameId, phase, process, selectedIndex: number | null, receivedAt?: number)`.
- Produces: `awaitPlayerWrites(playerId: string): Promise<void>`.
- Produces: `validateSelectedIndex(value: unknown, optionCount: number): number | null` in `answer.validation.ts`.
- Adds `AnswerResult.feedback: string` and preserves `timedOut: boolean`.
- Socket answer payload becomes `{ gameId: string; selectedIndex: number }`; no client `timeMs`.

- [ ] **Step 1: Write failing timeout/mastery and payload tests**

```ts
it('records a timeout without changing BKT mastery', () => {
  const before = currentPlayer(state).masteryStates.Addition;
  const outcome = processCardChallengeAnswer(state, null, state.currentChallenge!.startedAt + 25_000);
  expect(outcome.result.timedOut).toBe(true);
  expect(outcome.result.previousMastery).toBe(before);
  expect(outcome.result.newMastery).toBe(before);
  expect(outcome.state.players[0].consecutiveFailures.Addition).toBe(0);
});

it('rejects non-integer and out-of-range answer indices', () => {
  expect(validateSelectedIndex(-1, 4)).toBeNull();
  expect(validateSelectedIndex(1.5, 4)).toBeNull();
  expect(validateSelectedIndex(4, 4)).toBeNull();
  expect(validateSelectedIndex(2, 4)).toBe(2);
});
```

- [ ] **Step 2: Run engine/persistence tests and verify current wrong-answer timeout behavior fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/sockets/__tests__/answer.validation.test.ts backend/src/bkt/__tests__/feedback.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts backend/src/features/game/__tests__/persistence.test.ts --runInBand`

Expected: FAIL because timeout uses `-1`, updates mastery, and trusts client duration.

- [ ] **Step 3: Implement nullable timeout evidence and server timing**

```ts
export function validateSelectedIndex(value: unknown, optionCount: number): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < optionCount
    ? value as number
    : null;
}

const timedOut = selectedIndex === null;
const timeMs = Math.max(0, receivedAt - challenge.startedAt);
const newMastery = timedOut
  ? previousMastery
  : updateMastery(previousMastery, isCorrect, getAdjustedParams(challenge.difficulty));
```

Timeout increments `totalQuestions`, gives no reward, and breaks the streak, but does not increment the skill's consecutive-failure hint counter. Persist `selectedIndex: null`, `timedOut: true`, and equal before/after mastery. Await each human's pending write queue before loading priors for a new game. Generate operation-specific one-line feedback in `feedback.ts` and include it only in the answering learner's result.

- [ ] **Step 4: Run BKT, persistence, stall, and type tests**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__ backend/src/sockets/__tests__/answer.validation.test.ts backend/src/features/game/__tests__/persistence.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS; timeout rows retain unchanged mastery.

- [ ] **Step 5: Commit trustworthy answer handling**

```bash
git add backend/src/bkt/feedback.ts backend/src/bkt/__tests__/feedback.test.ts backend/src/sockets/answer.validation.ts backend/src/sockets/__tests__/answer.validation.test.ts backend/src/features/game/game.types.ts backend/src/features/game/game.engine.ts backend/src/features/game/game.service.ts backend/src/features/game/game.persistence.ts backend/src/features/game/__tests__/persistence.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts backend/src/sockets/game.handlers.ts frontend/src/features/game/hooks/useGameSocket.ts frontend/src/features/game/pages/GamePage.tsx frontend/src/features/game/types/game.types.ts
git commit -m "fix: keep timeout evidence out of BKT mastery"
```

### Task 5: Remove Auctions

**Files:**
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/features/game/game.engine.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/features/game/bot.engine.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: `backend/src/sockets/phase.deadlines.ts`
- Modify: `backend/src/features/game/__tests__/game.engine.test.ts`
- Modify: `backend/src/features/game/__tests__/stall.recovery.test.ts`
- Modify: `frontend/src/features/game/types/game.types.ts`
- Modify: `frontend/src/features/game/hooks/useGameSocket.ts`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`

**Interfaces:**
- Removes: `AUCTION`, `AuctionState`, `auctionState`, `placeAuctionBid`, `resolveAuction`, and `game:auction-bid`.
- Changes: `skipBuy(state)` returns `END_TURN` with the property owner still `null`.

- [ ] **Step 1: Replace auction tests with the approved decline behavior**

```ts
it('leaves a declined property unowned and ends the landing decision', () => {
  const state = onUnownedProperty();
  const next = skipBuy(state);
  expect(next.turnPhase).toBe('END_TURN');
  expect(next.properties.find(p => p.tileIndex === state.pendingTileEvent!.tileIndex)?.ownerId).toBeNull();
  expect(next.pendingTileEvent).toBeNull();
});
```

- [ ] **Step 2: Run game tests and verify they still expect `AUCTION`**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/features/game/__tests__/game.engine.test.ts backend/src/features/game/__tests__/stall.recovery.test.ts --runInBand`

Expected: FAIL until auction expectations and production paths are removed.

- [ ] **Step 3: Delete auction production paths and UI**

```ts
export function skipBuy(state: GameState): GameState {
  if (state.turnPhase !== 'BUY_DECISION') return state;
  return { ...state, turnPhase: 'END_TURN', pendingTileEvent: null };
}
```

Delete auction imports, service methods, socket handlers, timer branches, bot actions, frontend state/countdown, Gavel-only controls, and both backend/frontend auction types. Rename the skip button to `Skip Purchase`.

- [ ] **Step 4: Run backend tests and both typechecks**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs --runInBand`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS and a repository search for `AUCTION|auction-bid|AuctionState` returns no production match.

- [ ] **Step 5: Commit auction removal**

```bash
git add backend/src frontend/src
git commit -m "refactor: remove property auctions"
```

### Task 6: Remove Unreachable Roll and Quiz-Gated Level-Up Paths

**Files:**
- Modify: `backend/src/features/game/game.constants.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `backend/src/features/game/game.engine.ts`
- Modify: `backend/src/features/game/game.service.ts`
- Modify: `backend/src/bkt/bkt.selector.ts`
- Modify: `backend/src/features/game/bot.engine.ts`
- Modify: `backend/src/sockets/game.handlers.ts`
- Modify: existing backend tests that construct removed phases
- Modify: `frontend/src/features/game/types/game.types.ts`
- Modify: `frontend/src/features/game/hooks/useGameSocket.ts`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`

**Interfaces:**
- Removes phases `ROLL_CHALLENGE`, `LEVEL_UP_OFFER`, and `LEVEL_UP_CHALLENGE`.
- Removes challenge contexts `ROLL_CHALLENGE` and `LEVEL_UP`.
- Removes legacy service/socket answer/start/decline methods.
- Preserves `buildHouse`, `hasLevelUpToken`, and `FREE_LEVEL_UP_TOKEN`.

- [ ] **Step 1: Add reachability tests for the retained flow**

```ts
it('rolls directly into movement', () => {
  expect(startRollPhase(readyState()).turnPhase).toBe('MOVING');
});

it('keeps direct house building and free level-up tokens', () => {
  const next = buildHouse(buildableState({ hasLevelUpToken: true }), propertyIndex);
  expect(next.properties.find(p => p.tileIndex === propertyIndex)?.isLeveledUp).toBe(true);
  expect(currentPlayer(next).hasLevelUpToken).toBe(false);
});
```

- [ ] **Step 2: Run engine/duel/card tests before deletion**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/features/game/__tests__/game.engine.test.ts backend/src/features/game/__tests__/duel.test.ts backend/src/bkt/__tests__ --runInBand`

Expected: retained direct-flow tests PASS before deletion.

- [ ] **Step 3: Remove only unreachable quiz-gated code**

Delete `ROLL_CHALLENGE_BONUS`, `processRollChallengeAnswer`, `checkLevelUpEligibility`, `startLevelUpChallenge`, `processLevelUpAnswer`, `declineLevelUp`, their service wrappers, socket events, bot branches, `_skipLevelUpCheck` casts, and the unused `skipLevelUpCheck` end-turn parameter. Keep active Level Up property state/reward terminology.

- [ ] **Step 4: Run full backend tests and search removed symbols**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs --runInBand`

Run: `Get-ChildItem backend/src,frontend/src -Recurse -File | Select-String -Pattern 'ROLL_CHALLENGE|LEVEL_UP_OFFER|LEVEL_UP_CHALLENGE|_skipLevelUpCheck|submitRollChallengeAnswer'`

Expected: tests PASS and the search returns no production matches.

- [ ] **Step 5: Commit legacy removal**

```bash
git add backend/src frontend/src
git commit -m "refactor: remove unreachable quiz-gated phases"
```

### Task 7: Learning/Rules Verification

**Files:**
- Modify only regressions in files changed by Tasks 1–6.

**Interfaces:**
- Produces: the stable engine/socket contract consumed by the frontend plan.

- [ ] **Step 1: Run all backend suites**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs --runInBand`

Expected: all suites PASS.

- [ ] **Step 2: Run both typechecks**

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: both PASS.

- [ ] **Step 3: Verify removal and curriculum invariants**

Run: `Get-ChildItem backend/src,frontend/src -Recurse -File | Select-String -Pattern 'ACTIVE_SKILL_NAMES = \[''Addition'', ''Subtraction''\]|AUCTION|ROLL_CHALLENGE|LEVEL_UP_CHALLENGE|Standard 1 KSSR'`

Expected: no production matches.

- [ ] **Step 4: Confirm a clean checkpoint**

Run: `git status --short`

Expected: only pre-existing user untracked files remain.
