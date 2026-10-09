# Cloudflare migration validation

Checked locally on 10 October 2026 with Node 24.15.0. The implementation is on
`migration`; `main` and the existing Render deployment configuration remain the
fallback. No live Cloudflare deployment or production database writes were made.

## Passing checks

| Check | Result |
| --- | --- |
| Frontend and backend lint/type checks | Passed |
| Frontend tests | 60 passed across 13 files |
| Backend Jest tests | 359 passed across 39 suites |
| PostgreSQL SQL integration cases | 10 passed, run by the backend test wrapper |
| Cloudflare/workerd integration runner | 10 passed, including its parent test |
| Cloudflare browser checks | 7 passed |
| Original Render/Vite browser checks | 5 passed |
| Original frontend and Node backend production builds | Passed |
| Cloudflare frontend build and Wrangler deployment dry run | Passed |
| Production dependency audit (`npm audit --omit=dev`) | Zero reported vulnerabilities |

The automated SQL/runtime tests create temporary PostgreSQL/PGlite databases.
They use synthetic credentials and block external outbound traffic in the local
Cloudflare runtime. Neither the real Neon connection string nor production
learner data is required.

## Behavior exercised

- Existing guest profiles, profile edits, claimed usernames/PINs, sign-in and JWT
  compatibility.
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
- Timeout/hint evidence rules, bot exclusion from learner attempts, atomic SQL
  rollback, and idempotent finished-game/player-seat persistence.
- Failed room storage commits, a later queued command using restored handlers,
  connection-attachment failure after commit, and conditional player-directory
  recovery without overwriting a newer room claim.

The unchanged game-engine suites continue to cover purchases, building, rent
duels, challenge cards, jail, bankruptcy, scoring, mastery and difficulty rules.

## Checks still requiring the account

Follow [the deployment guide](CLOUDFLARE_MIGRATION.md) to configure Cloudflare
secrets and deploy. Then verify the published URL, the intended Neon database,
returning player identity, finished-match data and actual account usage. Run a
school-network rehearsal with the intended simultaneous pupil count before the
evaluation. Local checks do not establish live-account free-quota capacity or
guarantee the absence of every possible production error.

## Tooling notes

The existing optional 3D/physics asset produces Vite's large-chunk warning. Both
builds succeed; the migration preserves those assets and the basic-board fallback.

Compatible dependency updates removed the reported production advisories. The
full development dependency audit still reports 20 moderate entries in the Jest
coverage configuration chain rooted in `sprintf-js`. These tools are not included
in the deployed Worker; npm's force remedy proposes an incompatible test-tool
downgrade, which was not applied.
