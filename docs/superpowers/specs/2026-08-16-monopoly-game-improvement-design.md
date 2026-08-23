# Mathopoly Full-Game Improvement Design

**Date:** 2026-08-16  
**Status:** Approved for implementation planning  
**Delivery branch:** `monopoly-game-improve`

## 1. Objective

Improve the complete Mathopoly web game without replacing its core property-trading structure or changing how a winner is determined. The work covers runtime correctness, multiplayer recovery, the Bayesian Knowledge Tracing (BKT) learning loop, question generation, pacing, accessibility, responsive UI, code health, automated tests, and deployment hygiene.

The implementation must make the game dependable for real children and multiplayer sessions, not only for automated or bot-driven testing. Confirmed dead and unreachable systems may be removed, but active rules remain unless this specification explicitly changes them.

## 2. Approved Product Decisions

- Addition, Subtraction, Multiplication, and Division are all active learning skills.
- Product copy and comments describe arithmetic play without limiting the game to `Standard 1 KSSR`.
- Division remains an independent BKT skill. Multiplication and Subtraction act as readiness signals for division difficulty but are not updated when a learner answers a division question.
- Easy and medium division use exact whole-number results. Remainders appear only at hard difficulty.
- A timed-out question is logged as a timeout, gives no reward, and counts as unanswered for game accuracy, but does not change mastery.
- Question time begins only when the learner can see and answer the question.
- Difficulty timing is 25 seconds for easy, 20 seconds for medium, and 15 seconds for hard, with a numeric countdown and a clear final-five-second warning.
- Incorrect feedback uses `Incorrect. Correct answer: X.` followed by one concise worked step. The original response is the only BKT observation; there is no same-turn retry.
- Auctions are removed. A declined property remains unowned and may be bought on a later landing.
- End-of-game learning reports show all four skills with a progress bar, mastery percentage, a friendly status, and one recommended next-practice message. Detailed mastery is private to the learner.
- The interface keeps a recognizable, original Mathopoly property-game identity while selectively replacing weak current elements. It is not a pixel-for-pixel reproduction of any generated mockup.
- Git delivery uses the branch `monopoly-game-improve`, based on the current local `main`, including its six commits that are not yet on `origin/main`.

## 3. Chosen Approach

Use staged remediation inside the existing application rather than either a patch-only pass or a rewrite.

1. Add regression coverage for the observed failures.
2. Repair authoritative game timing and reconnect behavior.
3. Update the BKT/question system and remove auctions.
4. Remove confirmed unreachable legacy paths and establish explicit public state contracts.
5. Refactor oversized modules only at tested responsibility boundaries.
6. Apply the responsive UI redesign across every user-facing page.
7. Run automated and real-browser verification before pushing.

This sequence protects existing gameplay while allowing meaningful cleanup. A rewrite is out of scope because it would create unnecessary structural and behavioral risk.

## 4. Authoritative Game Flow and Pacing

### 4.1 Movement handshake

Rolling must no longer expose a resolved property decision or start a question while dice and pawn animations are still playing.

The server will:

1. Validate and commit the roll.
2. Enter a movement/presentation phase and publish the roll result.
3. Wait for the active human client to acknowledge that its movement animation completed.
4. Use a bounded server fallback so a missing, disconnected, throttled, or dishonest client cannot wedge the game.
5. Resolve the landed tile and only then publish the resulting decision, card, duel, or challenge.

Bots use the same logical phase boundary with a short server-controlled presentation delay. Client-side buttons remain disabled while dice or pawn motion is active. Duplicate movement acknowledgements are idempotent.

### 4.2 Phase deadlines

Deadlines are server-authoritative and phase-specific:

| Phase | Limit | Automatic result |
| --- | ---: | --- |
| Waiting to roll | 45 seconds | Roll automatically |
| Property purchase | 20 seconds | Decline; property stays unowned |
| Optional build/upgrade available | 30 seconds | Skip and end turn |
| End turn with no build available | 10 seconds | End turn |
| Easy question | 25 seconds | Record timeout; no reward |
| Medium question | 20 seconds | Record timeout; no reward |
| Hard question | 15 seconds | Record timeout; no reward |

The public payload carries authoritative opening and expiry timestamps. The timer is not derived from animation start time or trusted client timing. All automatic actions are announced by an accessible visible countdown.

### 4.3 Bot sequencing

Bot actions are published as ordered server transitions. Delayed presentation events must never contain or rebroadcast an older whole-game snapshot that can overwrite a newer state. Reconnect and human actions always receive the latest committed version.

## 5. Adaptive Learning and Question Generation

### 5.1 Active curriculum

The live curriculum list is the single four-skill list: Addition, Subtraction, Multiplication, and Division. Context mappings may weight a skill but must not silently deactivate a curriculum area.

The UI, constants, and comments must no longer claim that live play is restricted to Standard 1 KSSR. Product copy stays curriculum-neutral; any future mapping to a specific national curriculum requires an explicit, separately verified curriculum configuration.

### 5.2 Selection inputs

Question selection combines:

- current BKT mastery;
- observation count and difficulty evidence floors;
- recent exposure so one weak skill does not monopolize a session;
- property skill theme as a preference rather than a hard constraint;
- consecutive failures and hint requirements;
- division readiness derived from Division mastery plus supporting Multiplication and Subtraction evidence.

The selector keeps a strong preference for appropriate weak skills while guaranteeing periodic review of stronger skills.

### 5.3 Repetition control

Generated questions receive a stable semantic fingerprint based on operation, operands, missing target, and answer structure. Each learner keeps a recent window of eight fingerprints. Equivalent questions in that window are regenerated with a bounded retry count and a safe fallback, preventing obvious repetition without risking an infinite generator loop.

### 5.4 Division progression

- Easy: concrete sharing/grouping and exact single-step division.
- Medium: exact fact-family and structured long-division steps where appropriate.
- Hard: more involved division and remainder targets.

Weak supporting Multiplication or Subtraction evidence can cap a Division question's difficulty and select more explicit scaffolding. A Division response updates only Division mastery.

### 5.5 Context and feedback

Smart Buy questions must use the actual property price when presenting a purchase calculation. Hints and worked feedback refer to the specific operation and missing step instead of using generic encouragement.

Incorrect feedback contains the correct answer and one short worked step. Timeout feedback is visibly distinguished from an incorrect submitted answer.

### 5.6 Trust boundary and persistence

- Validate `selectedIndex` as a finite in-range integer.
- Calculate authoritative response duration from server timestamps; client `timeMs` is not trusted as learning evidence.
- A timeout writes a dedicated timed-out attempt with unchanged previous/new mastery.
- Persistence for a learner is serialized so a new game cannot reload stale mastery while the previous attempt queue is still draining.
- Hand-set BKT defaults remain configurable, but comments and UI must not call them empirically calibrated until real learner data supports that claim.

## 6. Rule Simplification and Legacy Removal

Remove auctions end to end:

- auction turn phases and state;
- engine/service methods;
- socket events and timers;
- frontend controls and icons used only for auctioning;
- bot auction behavior;
- auction-specific tests and stale comments.

Skipping a purchase moves to the normal post-landing/end-turn flow and leaves ownership unchanged.

Also remove the unreachable quiz-gated Roll Challenge and legacy quiz-gated Level-Up offer. Keep direct rolling, math events that are still reachable, property building/upgrading, level-up tokens, rent, scoring, rounds, and the existing game-ending structure.

## 7. Multiplayer, Reconnect, and Finished Games

- Starting a room is idempotent. Rapid double activation can create only one game.
- Lobby start uses the same authoritative game publication path as later transitions, ensuring the first turn timer is armed and host game identity is attached.
- Presence is tracked per player and game across all sockets. Closing one tab does not disconnect a player while another valid tab remains.
- Lobby reconnect returns the latest membership. A player removed after the grace period receives a clear seat-loss state rather than a stale lobby.
- Active-game reconnect restores public state plus the reconnecting learner's current challenge or duel side.
- Disconnect recovery cannot replace a newer phase timer with an obsolete one.
- Finished-game recovery sends final scores and the requesting learner's mastery report after refresh for the in-memory finished-game retention window.
- Public state exposes no other learner's mastery details or hidden question answers.

## 8. Public Contracts and Shared Rules

Replace spread-based redaction with an explicit `PublicGameState` projection. The public contract lists every allowed property rather than copying the private state and deleting known secrets. Private challenge answers, mastery maps, attempt counters, failure counters, and future server-only fields are therefore deny-by-default.

Board and economy rules must have one authoritative definition wherever practical. The frontend renders server-provided tile/rule data rather than maintaining a conflicting copy. Tax amounts, build costs, color groups, property prices, rent, player limits, and skill labels must not be independently hard-coded in multiple layers.

## 9. Frontend Design System

### 9.1 Visual direction

Keep the strongest current identity cues:

- deep forest-green environment;
- red tilted Mathopoly wordmark treatment;
- colorful property-group strips;
- bold black-edged cards and controlled hard shadows;
- warm yellow, teal, coral red, pale green, white, and black palette;
- playful primary-math/property-trading energy.

Redesign weak elements rather than preserving them by default:

- readable sans-serif body copy replaces condensed or monospaced text where those styles harm scanning;
- display typography remains bold and distinctive only where hierarchy benefits;
- board tiles use shorter labels, larger prices, and meaningful icons rather than extremely small rotated text;
- panels share a consistent spacing, border, shadow, focus, and state system;
- the layout uses the viewport efficiently and avoids disconnected islands of content.

The result is a modern editorial/neo-brutalist educational game, not an antique board, casino, generic dashboard, or copy of official Monopoly artwork.

The board subtitle and related landing/lobby copy use concise game-focused wording instead of the outdated `Standard 1 KSSR` restriction.

### 9.2 Page layouts

**Landing/player selection:** compact first viewport, clear primary path, readable token choices, and no clipped logo or required scrolling at normal mobile and desktop sizes.

**Profile claim/login:** compact card with the primary form and recovery path visible at common laptop heights.

**Lobby:** room code is a real keyboard-operable copy button; player seats are compact; remove-bot targets meet touch-size requirements; host controls stay above the fold; removed/reconnecting states are explicit.

**Desktop game:** compact top status bar, collapsible player rail, large central board, and a unified selected-space/contextual-action panel. Only actions valid for the current phase are rendered.

**Mobile game:** compact turn status, collapsible one-line roster, square board near the top, concise selected-space summary, and a sticky bottom action dock. Core actions never require scrolling through the player list or board details.

**Question and duel dialogs:** semantic dialog roles, focus entry and trapping, Escape behavior where safe, scrollable short-screen content, large answer targets, numeric countdown, final-five-second warning, and reduced-motion support.

**Game over:** scores appear without a multi-second mandatory reveal; animation is short and skippable; the table adapts to narrow screens without colliding columns; Exit is immediately reachable; the learner can open a private four-skill report.

### 9.3 Accessibility and responsive acceptance sizes

Core flows must work with mouse, touch, and keyboard at minimum across:

- 1366×768 desktop;
- 390×844 mobile portrait;
- 568×320 short landscape;
- 200% browser zoom at a common laptop resolution.

Interactive targets aim for at least 44×44 CSS pixels. Color is not the only status cue. Focus is visible. Board-tile navigation does not force keyboard users through all 20 tiles before reaching the current action.

## 10. Code Health and Module Boundaries

- Remove confirmed unused files, hooks, imports, exports, constants, helpers, legacy comments, and the broken standalone BKT script.
- Enable TypeScript unused checks and a working ESLint setup for both applications.
- Add frontend test tooling and scripts.
- Extract stable responsibilities from oversized modules only after regression coverage exists. Candidate boundaries include socket publication/deadlines, presence/recovery, question formatting/fingerprinting, game phase resolution, and page-level UI state.
- Preserve server-authoritative rules and avoid a wholesale engine rewrite.
- Retain four-argument Express error middleware while naming intentionally unused parameters clearly.
- Replace external font dependency with reliable local/system fallbacks unless a licensed local asset already exists.
- Add a valid favicon.
- Accept both documented local development origins without broadening production CORS unnecessarily.
- Repair current Three/Rapier deprecation and shadow warnings where supported, and lazy-load heavy 3D dice code so it does not dominate initial landing/lobby bundles.
- Align production build/start scripts so deployment runs an intentional compiled or source entry point, with no unused build artifact path.

## 11. Testing and Verification

Implementation follows regression-first/TDD behavior for each bug or rule change.

Automated coverage must include:

- all four skills active across live selectors;
- division exact/remainder progression and prerequisite difficulty caps;
- recent-question deduplication and generator invariants;
- timeout logging with no BKT transition;
- selected-index and timing validation;
- movement acknowledgement/fallback and delayed question deadlines;
- phase-specific automatic actions;
- auction absence and declined-property behavior;
- idempotent Start Game;
- first-turn timer arming;
- multi-tab presence and reconnect recovery;
- duel recovery;
- finished-game refresh with private mastery data;
- ordered bot state publication;
- explicit public-state redaction;
- responsive/action-dock components and accessible dialogs.

Final verification includes backend tests, frontend tests, lint, strict typechecks, production builds, question-generator stress tests, and real-browser functional/visual QA. Browser QA must cover the landing page, profile flow, lobby, human turn, dice/pawn transition, buy/decline, challenge, duel, reconnect, bot turn, and game-over report at the target viewports.

## 12. Delivery and Safety

- Existing untracked proposal documents, `.codex_qa`, `tmp`, temporary text, and `ui-prototype` remain outside commits.
- No force push, history rewrite, or direct update to `origin/main`.
- Push `monopoly-game-improve` only after verification and code review.
- The final report groups every meaningful change by gameplay, learning engine, backend/networking, frontend/accessibility, cleanup, tests/tooling, and deployment. It also records verification commands, outcomes, branch name, pushed commit, and any deliberately deferred concern.

## 13. Acceptance Criteria

The work is complete when:

1. The approved rules and learning decisions above are implemented.
2. No question or decision countdown is consumed by mandatory animation.
3. A real player can always reach the current action on desktop and mobile without hunting through a long page.
4. Reconnect, multi-tab, duplicate-start, duel, and finished-refresh regressions are covered and passing.
5. All four skills produce valid, appropriately progressive, non-repetitive questions.
6. Timeouts never alter mastery.
7. Auctions and confirmed unreachable legacy systems are absent from production code.
8. Public socket payloads do not expose answers or another learner's mastery.
9. Automated verification and the browser QA inventory pass.
10. The verified branch is pushed to GitHub and accompanied by a complete change summary.
