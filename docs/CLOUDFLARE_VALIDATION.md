# Cloudflare application validation

Checks recorded on 10 October 2026 with Node 24.15.0. The implementation is on
`migration`, whose default `dev`, `build` and `deploy` commands now use Cloudflare.
The original Render implementation remains on `main`. Local and deployed checks
are recorded below.

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

Cloudflare accepted the deployment for
[the migration URL](https://monomath-migration.monomath-a32bfd97d1bd.workers.dev).
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
deployment. The [setup guide](CLOUDFLARE_MIGRATION.md) explains the process.

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
