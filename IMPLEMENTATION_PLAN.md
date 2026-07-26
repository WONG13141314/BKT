# Math Monopoly — Implementation Plan

> Status: draft, written 2026-07-26. Verified against commit `678000c` (clean tree).
> Supersedes the deleted `GAMEPLAY_REDESIGN_PROMPT.md`, `TECH_STACK_RECOMMENDATIONS.md`
> and `Script/monopoly-uiux-redesign-prompt.md`.

## 1. What this product is

A **public multiplayer web game platform**. Anyone can host a room; up to 3 others
join with a 6-character code. Underneath the Monopoly shell is an **adaptive
learning engine (Bayesian Knowledge Tracing)** that models each player's mastery
of four arithmetic skills and targets questions at their weakest one.

It is a Final Year Project, so it has two deliverables that pull in different
directions and both must be satisfied:

- **Product** — a game that a child will actually play for 20 minutes.
- **Research** — evidence that the adaptive engine works, measured with data.

Every decision below is scored against both.

## 2. Core architectural decisions

### 2.1 Room code ≠ identity

Two independent systems that are currently conflated:

| | Room code | Player profile |
| --- | --- | --- |
| Lifetime | one session (~20 min) | permanent |
| Purpose | matchmaking | learner model |
| Storage | in-memory (`lobby.manager.ts`) | Postgres |
| Visible | yes | no |

### 2.2 Identity: anonymous-first, progressive

No signup wall. The pattern is Duolingo's, not Kahoot's.

1. **First visit** — user types a nickname and picks an avatar. The server creates
   a permanent `Player` row and returns a long-lived token. Stored in
   `localStorage`. The user is not told they made an account.
2. **Return visit** — token is found and reused. "Welcome back, Ali." Straight to
   Host / Join. Zero typing.
3. **Shared device** — a "Not Ali?" link lists other profiles used on this device
   and offers to create a new one.
4. **Optional upgrade** — "Save my progress" sets a username + 6-digit PIN
   (kid-friendly, no email). Makes the profile portable to another device.

Cost to the player on a return visit: **zero taps**. Same as Kahoot. But BKT now
has continuity.

### 2.3 Persistence: write on every answer

Mastery is written after **every single answer**, not at game end. Children abandon
games constantly; end-of-game writes would lose most sessions.

```
join         resolve stable playerId from token
game start   LOAD MasteryState for the 4 skills (missing → seed at pL0)
each answer  INSERT QuestionAttempt  +  UPSERT MasteryState
game end     INSERT Game + GamePlayer snapshot
```

Bots never touch the database.

### 2.4 Adaptivity: the question is the toll for the turn

Today, questions are produced by board geometry (dice → tile → *maybe* a
question), so practice volume is decided by luck and averages ~3 observations per
skill per session. BKT cannot converge on that.

**Roll Challenge** — every turn opens with one BKT-selected question.

- Correct → roll 2 dice.
- Wrong → roll 1 die. (You still move. Never punished into stalling.)

This yields ~12 guaranteed, BKT-targeted questions per session plus ~6
opportunistic tile challenges. Tile challenges (Smart Buy / Rent Defense / Level
Up) keep their property skill theming — good game design — but are no longer the
only source of evidence.

### 2.5 Answers never leave the server

The client receives the question *rendering data* and the option labels. It never
receives `correctIndex`, `answer`, `answerDigits`, `quotient`, `remainder`, or the
step results. Grading happens server-side. This is both an anti-cheat measure and
a data-integrity requirement — contaminated attempt data invalidates the research.

## 3. Phased plan

Phases are ordered so each one is independently shippable and testable.

---

### Phase 1 — Correctness & integrity ✅ DONE

No schema or design changes. Pure bug fixing. Shipped first because the data the
game produced before this was untrustworthy.

| # | Fix | Outcome |
| --- | --- | --- |
| 1.1 | Sanitise the challenge payload | New `challenge.public.ts` is the single place a challenge becomes client-safe. `PublicMathChallenge` drops `correctIndex` and the debug `text`; `PublicColumnQuestion` / `PublicLongDivisionQuestion` ship pre-laid-out `DigitCell` arrays instead of operands, answers, quotients or step results. Grading was already server-side and stays there. |
| 1.2 | Long-division answer leaks | `brought_down_digit` removed as a target — its answer was printed in the dividend directly above the blank, so it tested nothing; replaced by `product`, which exercises multiplication inside division. The redactor now truncates all rendered work at the target step, since any row below it can be solved backwards. |
| 1.3 | Multi-digit `?` rendering | Layout moved server-side; a whole-value target renders as one box, a digit target as one cell. |
| 1.4 | Question timer | New `ChallengeTimer` counts down to a server-issued `expiresAt`. The server runs its own deadline and auto-submits index `-1` (never correct) on expiry, so a throttled tab can't buy time. |
| 1.5 | Stall recovery | `gameService.resolveStalledTurn` forces any waiting phase forward — challenges grade as incorrect and *still count as attempts*, decisions take the cheapest option. Armed after every broadcast; shortened to 10s when the active player disconnects. Finished games are dropped from `activeGames` after 5 min. |
| 1.6 | Clock-cap stall | `endTurn` used to return the `isFinalRound` state without advancing `currentPlayerIndex`, stranding the player. The flag is now applied before the end check. |

**Also cleaned up:** dead `features/questions/*` module deleted, `Fractions`/`Decimals`
removed from the seed, unused imports and parameters removed, decorative emoji
stripped from backend strings, dead CSS removed, stale `PlaceValue / Money`
comment corrected.

**Verified:** backend + frontend `tsc` clean, production build succeeds, 72 tests
pass (up from 49). New suites: `challenge.public.test.ts` fuzzes 200 questions per
skill/difficulty asserting no answer-bearing key survives redaction and exactly one
`?` cell exists; `stall.recovery.test.ts` covers timeout grading, decision defaults
and the clock cap.

**Known behaviour preserved:** rolling and answering a dice challenge deliberately
do *not* auto-end the turn — the player sees where they landed and ends it
themselves, with the phase timer as the backstop.

---

### Phase 2 — Schema rewrite & identity ✅ DONE

| # | Change | Outcome |
| --- | --- | --- |
| 2.1 | Schema rewrite | Stale `TileType` enum, `GameProperty`, `houses`/`hasHotel`, `movementTokens`/`isInDebt` all gone. `Game`/`GamePlayer` are now finished-match snapshots, not a live mirror. Single baseline migration `20260726000000_init`. |
| 2.2 | `User` → `Player` | `displayName`, `avatar`, `isClaimed`, optional `username`/`pinHash`, `lastSeenAt`. `PlayerState.userId` renamed to `playerId` throughout the engine and frontend. |
| 2.3 | `Question` table dropped | `QuestionAttempt` is self-contained (`questionData` Json + `correctAnswer`), which fixes the previously-unusable `questionId` FK. `Skill` stays as a lookup. Admin stubs deleted with it. |
| 2.4 | Auth endpoints | `POST /auth/guest`, `POST /auth/refresh`, `GET/PATCH /auth/me`, `POST /auth/claim`, `POST /auth/signin`. 90-day token. PIN hashed with bcrypt; sign-in returns one message for both wrong-username and wrong-PIN. |
| 2.5 | Identity no longer destroyed | The `localStorage.removeItem('token')` on mount is gone. New `PlayerProvider` restores the profile once on boot; `LoginPage` shows "Welcome back" with zero typing. Profile switcher added for shared devices. Token key moved to `mm.token`. |
| 2.6 | Seed | Four skills, no question bank (questions are generated). |
| 2.7 | `/api/games` protected | `requireAuth` middleware; socket auth now reads `playerId` and resolves a `Player`. |

**Also:** `env.ts` validates configuration with zod at startup (was a TODO) and
adds `DIRECT_URL` for Neon migrations; `apiFetch` surfaces server error messages
instead of `API Error: 400`; router gained a `RequirePlayer` guard and `/` is now
the entry point. Deleted as unreferenced: `features/users`, `features/admin`,
`features/dashboard`, `shared/components`, `layouts`, and the email/password auth
stubs. Avatars are Monopoly tokens chosen by the player and carried into the lobby.

**Verified:** backend + frontend `tsc` clean, production build succeeds, 72 tests
still pass. No gameplay logic touched.

---

### Phase 3 — Persistence & attempt logging ✅ DONE

The research payload. This is what turns the project from "a game with a
difficulty dial" into an adaptive learning system. All of it lives in the new
`game.persistence.ts`, the single module allowed to touch the database from the
game feature.

| # | Change | Outcome |
| --- | --- | --- |
| 3.1 | `MasteryState` loaded at game start | `createGame` fetches stored P(L) for every human and seeds `PlayerState.masteryStates` through the new `GamePlayerSeed.masteryPriors`. Skills with no history fall back to `INITIAL_MASTERY`, so first-time and returning players share one code path. Bots never load or write. |
| 3.2 | `QuestionAttempt` per answer | One row per answer carrying `pMasteryBefore`, `pMasteryAfter`, `predictedPCorrect` and `opportunityIndex` — written at answer time because the prediction is unrecoverable once mastery updates. `questionData` stores the **unredacted** item: Phase 1 keeps answers out of browsers, but the research table needs the exact question. |
| 3.3 | Non-blocking writes | Chained per player, so two answers cannot race on one `MasteryState`, but concurrent across players. Failures are logged and swallowed — a database outage degrades the log, never the game. Nothing in a turn awaits a write. |
| 3.4 | `Game` / `GamePlayer` snapshot | Written at game end, after the scoreboard has already been emitted. |

**Design decisions worth recording:**

- **`opportunityIndex` comes from the upsert.** The `attempts` value returned by
  the `MasteryState` upsert *is* the index, so the two tables agree by
  construction with no counting query and no race. Both writes share one
  transaction, so mastery can never advance without the attempt that caused it.
- **All six answer paths funnel through `gameService.submitAnswer`.** That covers
  timeouts too, which reach the engine via `resolveStalledTurn` rather than a
  socket event — logging at the socket layer would have silently dropped them.
- **Timeouts are recorded, not dropped.** `selectedIndex === -1` is the server's
  no-answer sentinel; those rows carry `timedOut: true` and a null
  `selectedAnswer`. A timeout is usually "didn't know" but sometimes a closed
  laptop, and the analysis must be able to separate them.
- **`GameState.dbGameId`.** Room codes are recycled, so `game_<CODE>` cannot
  identify a match. Each match gets a UUID that attempts and the snapshot share.
- **Persistence is inert under `NODE_ENV=test`.** `backend/.env` points at real
  Neon and dotenv loads it in Jest — without this guard, a test run would append
  to the research dataset. The row-building logic is still fully tested through
  the pure `buildAttemptData`.
- **The skill cache loads lazily, not at boot.** A boot-time hard failure would
  crash-loop the service whenever Neon is asleep. Instead `warmPersistence`
  reports a missing seed at startup and writes degrade loudly.

**Verified:** backend + frontend `tsc` clean, 82 tests pass (up from 72). A
23-assertion smoke test against live Neon confirmed the full loop — three correct
Division answers in session 1 raised stored P(L) from 0.10 to 0.9365, session 2
resumed at exactly 0.9365 with the other three skills still at 0.10,
`opportunityIndex` ran 1→4 across both sessions, the BKT chain was continuous
(`pMasteryAfter[n] == pMasteryBefore[n+1]`), the bot wrote nothing, and a timeout
landed as a flagged attempt. Test data removed afterwards.

**Noted for Phase 4:** three correct answers took P(L) from 0.10 to 0.94, which
confirms 4.4 — with `MASTERY_THRESHOLD` at 0.95 the difficulty band escalates far
too fast to be meaningful.

---

### Phase 4 — Adaptivity rebalance

| # | Change | Files |
| --- | --- | --- |
| 4.1 | **Roll Challenge** — a mandatory BKT-selected question at the start of every turn (§2.4). Replaces the current 1-in-3 dice challenge, which was hard-locked to difficulty 1 on single-digit dice values and was corrupting Addition/Subtraction estimates. | `game.engine.ts`, `game.types.ts`, `bkt.selector.ts`, `GamePage.tsx` |
| 4.2 | `propertySkillTheme` becomes a **×1.5 weight boost**, not a hard filter. Today it collapses `eligibleSkills` to one skill, so BKT skill selection only ever runs for `CHALLENGE_CARD` and `JAIL_ESCAPE`. | `bkt.selector.ts:129` |
| 4.3 | `selectWeightedRandom` is actually argmax-with-noise, not weighted random. Replace with a roulette wheel over `(1 − pL)²`. | `bkt.selector.ts:221` |
| 4.4 | `MASTERY_THRESHOLD` 0.95 → **0.85** (the standard Corbett & Anderson value). 0.95 with pS=0.10 demands near-perfection and is unreachable. | `bkt.defaults.ts` |
| 4.5 | Individualised prior: on session 2+, seed from the stored P(L) instead of the constant. `params.pL0` is currently dead code — `INITIAL_MASTERY` is used instead. | `bkt.defaults.ts`, `game.engine.ts:82` |
| 4.6 | Board rebalance: equal tile representation for all 4 skills (Multiplication and Division have only 2 tiles each). Fix the group/tile mismatches — blue group is tagged `Addition` but tile 2 is `Subtraction`; red group is `Subtraction` but tile 17 is `Addition`. | `board.config.ts` |
| 4.7 | Misconception-based distractors instead of `correct ± random`: forgot-to-carry, borrowed-wrong, place-value-slip. Better pedagogy, and it lets you diagnose *which* error a child makes. | `question.generator.ts:35` |
| 4.8 | Real hints. `determineHint` returns generic encouragement that never references the question. Replace with step scaffolding tied to the actual missing digit. | `bkt.selector.ts:62` |

**Acceptance:** a simulated player weak in Division receives ≥40% Division
questions; median questions per session ≥ 15; difficulty escalates for a player
answering correctly.

---

### Phase 5 — Player-facing progress

Currently there is no way for anyone to ever see mastery. `AppRouter` has three
routes and the whole dashboard feature is TODO stubs.

- **5.1** Post-game mastery report — per-skill before/after, biggest improvement.
  `generateMasteryReport` exists but reports zeroes for attempts; wire it to real data.
- **5.2** `/profile` — mastery per skill, total games, accuracy trend, match history.
- **5.3** Route it: `/`, `/profile`, `/lobby`, `/game`. Add `ProtectedRoute` (exists, unrouted).
- **5.4** Show adaptive progression *implicitly* — a skill's difficulty band shown
  as a subtle scale, never as an "EASY/HARD" badge.

---

### Phase 6 — Evaluation tooling (the FYP marks)

- **6.1 Pre/post test** — 10 fixed items across the 4 skills, non-adaptive, shown
  before the first session and after the last. Gives normalised learning gain,
  which is the evidence a supervisor asks for by name.
- **6.2 Ablation flag** — `adaptive` vs `random-difficulty` selection, assigned per
  player. Compare learning curves. **This removes the need for a second control
  classroom**, which is where most FYP trials die.
- **6.3 Simulated students** — generate synthetic learners with known true pL/pT and
  show BKT recovers them. About a day of work, and it means the evaluation chapter
  survives even if a real trial falls through. Build this regardless.
- **6.4 CSV / JSON export** of `QuestionAttempt` for analysis in R or Python.
- **6.5 Analysis queries** — learning curves (error rate vs `opportunityIndex`),
  AUC/RMSE of `predictedPCorrect` vs `isCorrect`, difficulty distribution over time.

---

### Phase 7 — Cleanup & platform hardening

- **7.1** Shared types package. The frontend hand-copies backend types *and*
  constants (`frontend/.../game.types.ts`, `frontend/.../config/board.config.ts`)
  and they are already drifting.
- **7.2** Delete dead code: `features/questions/*`, the unrouted `useAuth` stub,
  the admin stubs orphaned by dropping `Question`.
- **7.3** Strip decorative emoji from backend strings (`bkt.selector.ts` hints,
  `game.engine.ts` level-up message).
- **7.4** Snapshot game state to Postgres on each phase transition so a server
  restart (or a Render free-tier sleep) can rehydrate instead of destroying every
  live game. In-memory stays the hot path.
- **7.5** Platform basics: room-code expiry, rate limit on room creation and guest
  signup, nickname profanity filter.
- **7.6** Game log panel in the sidebar — quiet, append-only, no popups. Doubles as
  the human-readable event trace for the write-up.

## 4. Sequencing

```
Phase 1  ──────────────►  ships alone, no dependencies
Phase 2  ──────────────►  needs nothing; unblocks 3
Phase 3  ──────────────►  needs 2
Phase 4  ──────────────►  needs 3 (for the individualised prior)
Phase 5  ──────────────►  needs 3
Phase 6  ──────────────►  needs 3
Phase 7  ──────────────►  anytime, fold into the others opportunistically
```

Phases 1–3 are the critical path. If time runs out, 1 + 2 + 3 + 6 is a complete
FYP; 4 and 5 are what make it a good one.

## 5. Explicitly out of scope

- Teacher / classroom / roster features. The platform is player-first; classes can
  be layered on later without changing the identity model.
- Email accounts and password reset. Username + PIN is enough.
- Authored question banks. The generator replaces them.
- Native mobile apps.
- Heavy animation libraries (`dice-box`, `howler`, `framer-motion`,
  `canvas-confetti`). CSS transitions are sufficient; revisit only if the game
  feels flat after Phase 5.

## 6. Known risks

| Risk | Mitigation |
| --- | --- |
| School trial does not happen | Phase 6.3 simulated students + 6.2 ablation make the evaluation self-contained |
| Shared devices mix up profiles | Profile switcher (2.5); PIN claim (2.4) for anything that matters |
| BKT parameters are hand-set, not fitted | Declare as a limitation; optionally fit from Phase 3 data once enough attempts exist |
| One KC per operation is a simplification | "Find the sum" and "find the missing operand" are arguably different skills. State it in the write-up, or split them as future work |
| In-memory game state lost on restart | Phase 7.4 snapshotting |
