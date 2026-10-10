# MonoMath — Adaptive Arithmetic Property Game

**Play now: [Open MonoMath](https://monomath-migration.monomath-a32bfd97d1bd.workers.dev).**

The Cloudflare account, public address and application secrets are already
configured for this deployment. To play, open the link. To keep an existing
claimed profile, sign in with its username and six-digit PIN.

Future updates from this computer use `npm run deploy`. Optional automatic
deploys from GitHub are explained in the
[setup guide](docs/CLOUDFLARE_MIGRATION.md#9-optional-automatic-deploys-from-github).

The **`migration` branch runs the website and game server on Cloudflare**, with
the existing Neon PostgreSQL database. Its default development, build and deploy
commands use Cloudflare. **`main` is the separate Render backup.**

## Fresh setup on another computer or account

1. Install Node.js **24**, open PowerShell in `D:\Documents\BKT` on the
   `migration` branch, and run `npm ci`.
2. Run `npm run setup:cloudflare`. If a browser opens, sign in to your Cloudflare
   account and authorize Wrangler. The script uses the existing database and JWT
   settings, builds the game, prepares a free public hostname, uploads the two
   required secrets privately, and deploys
   **`monomath-migration`**.
3. Open the `https://monomath-migration.<your-account>.workers.dev` link printed
   after deployment. Try solo play, then multiplayer using two separate browser
   profiles or devices.

Use **Workers Free** and **Neon Free** for RM0 hosting. Setup publishes a real
deployment; games played there write to the configured Neon database. The
[setup guide](docs/CLOUDFLARE_MIGRATION.md) explains database isolation, existing
players, evaluation checks and free allowances. See the
[validation record](docs/CLOUDFLARE_VALIDATION.md) for what has been tested.

## The game

A public multiplayer web game for primary-school mathematics. One player hosts, up
to three join with a room code. Underneath the Monopoly shell is a Bayesian
Knowledge Tracing (BKT) engine that models each player's mastery of four
arithmetic skills, prioritises weaker skills, and schedules regular review.

During each match, each learner has a private question history. The selector avoids more than three
questions in a row on the same skill and reviews skills missing from the last
eight questions. Difficulty rises at most one tier at a time; answered evidence,
recent errors and division prerequisites still limit which tiers are available.
Each human question offers one optional **Help me start** strategy cue with
highlighted cells. Hints remain private, keep all four choices and normal game
rewards, and preserve the original deadline. Questions allow **30 / 45 / 60
seconds** for easy / medium / hard in both modes and all challenge contexts.
These are provisional reasoning windows for pupils aged 10–12, not validated
age norms. See [the timing and hint policy](docs/question-timing-and-hints.md)
for the research rationale and pilot calibration plan.

A timeout or assisted answer remains a recorded game opportunity but does not
update BKT mastery, supply difficulty evidence or refresh the last practice date.
Independent wrong answers still update BKT. The attempt log stores actual hint
use and timing metadata inside `questionData`; no database migration is needed.
BKT parameters remain provisional settings to evaluate with pupil data.

During solo play, each bot action reads the current match state when it runs.
Landing events wait for connected players' dice and token animations, with a
12-second server fallback if an acknowledgement is lost. Questions are created
at landing so each new defence gets its own full deadline. Idle 3D scenes render
on demand; a basic board and dice remain available when WebGL is unavailable.
Answer feedback uses one result card instead of simultaneous reward and answer
notifications. See [runtime debugging notes](docs/gameplay-runtime.md).

## Stack and architecture

| Part | Technology |
| --- | --- |
| Website | React, Vite and TypeScript, served by Worker Static Assets |
| HTTP entry point | Cloudflare Worker |
| Live game | SQLite-backed `GameRoom` Durable Objects and native WebSockets |
| Login/profile API | `ApiService` Durable Objects, JWT and bcrypt |
| Room membership | `PlayerDirectory` Durable Objects |
| Permanent database | Neon PostgreSQL, accessed through its HTTP SQL driver |

The website, API and live connection share one origin. Each room owns its game
rules, sockets, durable snapshots, saved deadlines and pending research writes.
Idle connections use WebSocket hibernation; persisted alarms resume deadlines
and retry database writes. Stable event IDs prevent retrying an attempt from
incrementing mastery twice.

Neon retains player identity, BKT mastery, question evidence and finished-match
history. The existing schema and four seeded skills are reused without a schema
migration or reset. Prisma files remain database tooling; the deployed game does
not use a Prisma client, Express server or Socket.IO.

Players can begin with a nickname and later claim a username/PIN to recover the
same profile on another browser. A new website origin has separate browser
storage, so existing players should use their claimed credentials to retain
their previous progress.

## Development and publishing

| Command | Purpose |
| --- | --- |
| `npm run setup:cloudflare` | Authenticate if needed, upload existing settings and publish the game |
| `npm run dev:cloudflare:test` | Play locally with a temporary database and no account secrets |
| `npm run dev` | Run the Cloudflare development server using local `.dev.vars` |
| `npm run build` | Build the website and create a deployment dry run |
| `npm run deploy` | Build and publish an update after the first setup |
| `npm run test:cloudflare` | Run isolated Cloudflare/workerd integration checks |

For a local game connected to Neon, copy `.dev.vars.example` to `.dev.vars`,
enter a test database connection string and JWT secret, then run `npm run dev`.
The detailed guide explains this option. Real database settings allow real
database writes; the isolated test command keeps its data temporary.

Only the `main` branch contains the original Render setup. Deleting the GitHub
`migration` branch would not delete a deployed Cloudflare Worker or undo database
writes. Saved Cloudflare rooms belong to their Worker and do not transfer between
hosting platforms.

## Tests

```bash
npm run verify
```

The verification command checks lint, TypeScript, game/learning tests, frontend
component tests and the Cloudflare build. Run `npm run test:cloudflare` for the
isolated runtime checks. Browser checks use the same temporary Cloudflare game:
`npm run test:e2e --workspace=frontend`.

## License

Part of a Final Year Project (FYP).
