# Mathopoly: Cloudflare application validation

## Main promotion checks — 13 October 2026

Compared the original Render `main` at `1b38c39` with Cloudflare `migration` at
`3a07333`, then checked the promotion fixes with Node 24.15.0. The original Render
commit is preserved on `codex/render-backup-2026-10-13`. Promotion advances `main`
through its existing history; it does not replace or rewrite that history.

| Check | Result |
| --- | --- |
| `npm run verify`: lint and TypeScript | Passed |
| Frontend Vitest | 61 passed across 13 files |
| Backend Jest | 369 passed across 38 suites |
| PostgreSQL evidence contracts, invoked by Jest | 13 isolated SQL cases passed |
| Real Cloudflare/workerd integration | 11 passed, including its parent test |
| Chromium E2E, with synthetic matches completed | 8 passed |
| Frontend production build and Wrangler deployment dry run | Passed |
| Source and whitespace review | Passed |

The frontend pages, game components, styles, audio and public assets are unchanged
from the original `main`. The game-engine implementation and BKT logic are
preserved; their differences are branding comments or test descriptions. Existing
engine/socket tests cover purchases, building, rent duels, cards, jail,
bankruptcy, scoring, adaptive questions, hints, deadlines and feedback privacy.
The Neon schema and initialization SQL are unchanged apart from comments.

Review identified and fixed three migration regressions before promotion:

- Slow Neon writes no longer hold the room command queue or its alarm handler.
  Gameplay commits first; research writes run separately with durable retry
  deadlines. Tests hold a SQL request open while a correct answer is graded and
  an automatic phase deadline advances the turn. Failed outbox retirement and
  shared required-prior reads also have regression coverage.
- Changing rooms on another device synchronizes that profile's already committed
  previous-room evidence before publishing its new membership. Concurrent claims
  and failed synchronization are covered. A real-runtime check starts the next
  game and verifies it loads the synchronized mastery. Existing live-game seat
  authorization remains unchanged; this barrier covers committed evidence at
  handover rather than preventing simultaneous active games for one profile.
- Local HTTP devices without `crypto.randomUUID()` can still send distinct game
  action IDs using `crypto.getRandomValues()`, without reconnecting repeatedly.

Setup now accepts `main` and `migration`. Playwright always starts its isolated
test server instead of reusing a possibly real-database development server.
Browser checks exercise claimed-profile recovery on another browser, rejection
of an incorrect PIN, multiplayer turns and reconnection, solo bot add/remove and
progression, direct game reload, full-match scores and private four-skill learning
reports. Landing checks cover phone/tablet/desktop layouts, keyboard focus and
persisted sound settings. Captured landing and solo/multiplayer board screenshots
were visually inspected.

These checks used temporary PostgreSQL/PGlite and synthetic credentials. The
runtime fixture blocks external outbound requests. No deployment, production
database write, schema reset or learner-data cleanup was performed for this
promotion. Windows Jest/workerd checks ran with the process access they require
after sandbox filesystem errors prevented the initial runs from completing.
The successful final runs are the results listed above.

The promotion commit uses `[skip render]` to suppress Render's automatic deploy
for this push. Existing Render services still tracking `main` must be moved to
the backup branch or have automatic deployment disabled before subsequent
ordinary pushes. Cloudflare Workers Builds must track `main` if automatic
Cloudflare deployment is desired; a Git branch update does not change hosting
settings. See [the setup guide](CLOUDFLARE_SETUP.md#8-the-render-backup-and-branch-deletion).

No feature regression was found in these checks. They do not certify production
hosting settings, every browser/device or school-scale simultaneous capacity.
The existing Vite warning about large optional 3D/physics chunks remains.

## Previous validation — 10 October 2026

Checks recorded on 10 October 2026 with Node 24.15.0. At the time of these checks,
the Cloudflare implementation was on `migration` and the Render implementation
was on `main`. Cloudflare is now the implementation on `main`, with the original
Render code preserved on `codex/render-backup-2026-10-13`. The existing `migration`
branch is retained. The counts and deployed observations below describe the
10 October checks, not a new run after promotion.

## Passing local checks

| Check | Result |
| --- | --- |
| Frontend and backend lint/type checks | Passed |
| Frontend tests | 60 passed across 13 files |
| Backend Jest tests | 361 passed across 38 suites |
| PostgreSQL SQL integration cases | 13 passed, run by the backend test wrapper |
| Cloudflare/workerd integration runner | 10 passed, including its parent test |
| Isolated Cloudflare browser checks | 7 passed |
| Cloudflare frontend build and Wrangler deployment dry run | Passed |
| Production dependency audit (`npm audit --omit=dev`) | Zero reported vulnerabilities |

The automated SQL/runtime tests create temporary PostgreSQL/PGlite databases.
They use synthetic credentials and block external outbound traffic in the local
Cloudflare runtime. Neither the real Neon connection string nor production
learner data is required.

## Behavior exercised

- Existing guest profiles, profile edits, claimed usernames/PINs, sign-in and JWT
  compatibility.
- Cloudflare game HTTP creation, seat authorization, public-state redaction,
  scoreboard access and missing-game responses.
- Separate multiplayer identities, room creation/joining/readiness, bot setup,
  host transfer, room changes across tabs, and new room creation.
- Both humans taking turns, dice/movement acknowledgments, solo bot progression,
  bank-offer questions, hints and answers, and direct game-page reloads.
- Real browser socket disconnection/reconnection without repeating a roll.
- Forced Durable Object hibernation preserving a movement deadline, dice identity
  and an already-received movement acknowledgment.
- A real question answer during a synthetic database outage, durable evidence
  retention, hibernation, automatic alarm retry, correct PostgreSQL/BKT storage
  and duplicate-delivery protection.
- Timeout/hint evidence rules, historical independent counts per learner/skill,
  first assisted answers of either correctness, bot exclusion, atomic SQL
  rollback, and idempotent finished-game/player-seat persistence.
- Failed room storage commits, a later queued command using restored handlers,
  connection-attachment failure after commit, and conditional player-directory
  recovery without overwriting a newer room claim.

The unchanged game-engine suites continue to cover purchases, building, rent
duels, challenge cards, jail, bankruptcy, scoring, mastery and difficulty rules.

## Passing deployed checks

Cloudflare accepted the Mathopoly application deployment during these checks.
The current public deployment is
[Mathopoly](https://mathopoly.mathopoly.workers.dev).
The automatic `npm run setup:cloudflare` flow completed successfully, including
account checks, build, public hostname, private secret upload, deploy and health.

| Deployed check | Result |
| --- | --- |
| Public HTTPS `/api/health` | 200, after a temporary initial connection failure |
| Guest/profile API | Guest creation 201, profile read and avatar update passed |
| Claimed username/PIN | Claim passed; wrong PIN returned 401; correct sign-in restored the same Neon profile |
| Token refresh/signature | Refresh passed; Cloudflare token verified with the existing local application JWT key |
| Existing Neon connection and seed data | Connected; Addition, Subtraction, Multiplication and Division present |
| Deployed browser run | All 7 cases passed in 1.3 minutes |
| Game/room/auth server errors during the final run | None observed |
| Finished matches and research synchronization | Verified in Neon; pending room writes drained before cleanup |

The JWT signature check used `backend/.env`; the deployed Render dashboard's
current secret was not inspected. Claimed username/PIN sign-in restored the
existing database identity.

The final deployed browser run covered normal multiplayer and bot play,
reconnection, direct game-page reloads, finished matches and leaving for a new
lobby. Initial five-second browser-test waits were increased to 15 seconds after
traces showed authentication/socket handshakes and the existing animation/feedback
holds could exceed them. This changed test wait budgets; production gameplay
timings were unchanged.

A read-only Neon audit of the exact nine synthetic gameplay profiles found
**13 question attempts, 12 mastery rows, five hinted or timed-out attempts,
five finished matches and 10 player seats**. Opportunity ordering, lifetime
mastery counters and independent-correct counters matched. Assisted answers and
timeouts did not change mastery; probability values were valid; every attempt
included timing policy and hint usage metadata. Finished bot seats had null
`playerId` values.

Cleanup checked the exact synthetic names/UUIDs and complete match rosters before
removing those nine test profiles and five matches. Final checks found zero
remaining test profiles, evidence rows, mastery rows, game rows or seats in Neon.
The separate authentication test profile was also removed. Existing learner data
was untouched by this cleanup.

For a new account or checkout, `npm run setup:cloudflare` handles browser
sign-in when required, hostname registration, private secret upload and
deployment. The [Mathopoly setup guide](CLOUDFLARE_SETUP.md) explains the process.

## Before the school evaluation

Run a school-network rehearsal with the intended simultaneous pupil count and
watch account usage. These functional checks do not establish that 120 pupils
can play simultaneously within free quotas; that capacity has not been load
tested.

## Tooling notes

The existing optional 3D/physics asset produces Vite's large-chunk warning. The
Cloudflare build succeeds and preserves those assets and the basic-board fallback.

Compatible dependency updates removed the reported production advisories. The
full development dependency audit still reports 20 moderate entries in the Jest
coverage configuration chain rooted in `sprintf-js`. These tools are not included
in the deployed Worker; npm's force remedy proposes an incompatible test-tool
downgrade, which was not applied.
