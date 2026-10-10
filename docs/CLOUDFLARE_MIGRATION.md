# MonoMath: Cloudflare setup and evaluation checks

The **`migration` branch is the Cloudflare implementation**. Its website, API and live game deploy together as **`monomath-migration`**, with your existing Neon PostgreSQL database. The original Render implementation stays on **`main`** as a separate backup.

The current account is already configured: **[open the deployed game](https://monomath-migration.monomath-a32bfd97d1bd.workers.dev)**. Local and deployed checks are recorded in [the validation document](CLOUDFLARE_VALIDATION.md). The setup steps below are for a fresh computer/account; later updates from this computer use `npm run deploy`.

## 1. Get a playable link in three steps

1. Install Node.js **24**, open PowerShell in the project folder, and install the dependencies:

   ```powershell
   Set-Location 'D:\Documents\BKT'
   git branch --show-current
   npm ci
   ```

   The branch should be `migration`.

2. Run the automatic setup:

   ```powershell
   npm run setup:cloudflare
   ```

   If a browser opens, sign in to your Cloudflare account and select **Allow** to authorize Wrangler. Return to the terminal and let setup finish. Use the **Workers Free** plan. Setup reuses your account's `workers.dev` hostname, or registers a free one automatically when the account has none. [Cloudflare public addresses](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

3. Open the exact **`https://monomath-migration.<your-account>.workers.dev`** link printed after deployment. Try solo play, then join a multiplayer room from a second browser profile or device.

Setup checks Cloudflare authentication and starts browser login if needed. It then builds the website/game server, prepares the free public hostname, privately uploads `DATABASE_URL` and `JWT_SECRET`, deploys the Worker and checks `/api/health`. It normally reuses `backend/.env` without editing it. Settings take precedence in this order: **process environment → `.dev.vars` → `backend/.env` → root `.env`**. If `.dev.vars` already exists, check which database it names before setup. This is a real deployment: playtests write to the configured Neon database.

Wrangler's `whoami --json` reports authentication status; `login` handles browser authorization. Setup shows the login URL while authorization is pending. If browser login cannot finish, run `npx wrangler login --browser=false` separately, open its printed URL, and rerun setup after authorization. A machine without a local callback server can use `npx wrangler login --device`. [Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/)

If you have several Cloudflare accounts, put the intended `CLOUDFLARE_ACCOUNT_ID` in `.dev.vars`; setup cannot automatically choose between them. If automatic hostname registration fails, follow the script's message to create a `workers.dev` subdomain in **Workers & Pages**, then rerun setup.

The two secrets are sent to `wrangler secret bulk` through its standard input, without putting their values in command arguments or a temporary upload file. Updating secrets is a publishing operation. [Wrangler secret upload](https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-bulk)

Setup waits about three minutes for a new public address to become reachable and prints progress during that wait. If it then prints **“Published at …, but the health check is not ready yet”**, Cloudflare has accepted the deployment but setup has not verified the public endpoint. Keep that URL and check it again shortly. A passing health response verifies the endpoint; gameplay and Neon persistence still need the checks below.

After first setup, publish later code changes with:

```powershell
npm run deploy
```

Run updates outside active evaluation sessions. Use the gameplay and persistence checks below before sharing the link with pupils.

## 2. What this branch runs

The intended free setup is:

| Part | Service | What it does |
| --- | --- | --- |
| Game website | Cloudflare Worker Static Assets | Serves the React/Vite frontend |
| Live multiplayer | Cloudflare SQLite-backed `GameRoom` Durable Objects | Owns each room, game state, WebSockets, saved deadlines and pending database writes |
| Login/profile API | SQLite-backed `ApiService` Durable Objects | Runs the existing guest/profile/username/PIN flows |
| Player room membership | SQLite-backed `PlayerDirectory` Durable Objects | Coordinates one profile's room claims across browser tabs/devices and room objects |
| Permanent database | Your existing Neon PostgreSQL database | Keeps player identities, BKT mastery, question evidence and finished matches |

The frontend, `/api/*`, and `/ws` share one Cloudflare URL. This is a **Workers deployment**, using the existing `wrangler.jsonc`; you do not need a separate Cloudflare Pages project, Supabase project or paid domain.

Neon keeps the existing PostgreSQL schema. The runtime accesses it through Neon's HTTP SQL driver; Prisma remains database tooling. **This migration requires no PostgreSQL schema migration or database reset.** The `new_sqlite_classes` entry in `wrangler.jsonc` creates three Cloudflare classes: `GameRoom`, `ApiService` and `PlayerDirectory`, separately from Neon. Each object owns its own storage; the directory coordinates a player's room membership across objects.

Keep `wrangler.jsonc`'s Worker name, Durable Object class names, and migration tag stable after deployment. Renaming them can select different storage rather than upgrading your existing rooms.

The deployed API needs `DATABASE_URL` and `JWT_SECRET`; `JWT_EXPIRES_IN` is already `90d`. Use the **same JWT secret** as the existing application to keep its signed tokens compatible. The shared origin normally needs no production `CORS_ORIGIN`. `DIRECT_URL` is a Prisma tooling setting, not a Worker secret.

The same database and JWT secret preserve server-side identities. Browsers remember profiles separately for each website origin, so the new `workers.dev` URL cannot automatically read the old website's local storage. A returning player should claim a username and six-digit PIN on the old website first, then sign in on Cloudflare. Choosing “new player” creates a separate profile.

## 3. Development and isolated checks

For a quick browser trial that requires **no Neon credentials**, run:

```powershell
npm run dev:cloudflare:test
```

Open **http://127.0.0.1:8787**. This runs the actual Cloudflare game runtime with a temporary PostgreSQL/PGlite database and synthetic secrets. It blocks external database access, reads no project secrets, and loses its test data when you stop it with Ctrl+C. Use this first for solo, multiplayer, bots and reconnect checks. It does not test the deployed Cloudflare account or real Neon connectivity.

For a local trial connected to a **Neon test branch**, follow the separate `.dev.vars` setup below.

Copy the example only if you do not already have a `.dev.vars` file:

```powershell
Copy-Item -LiteralPath '.dev.vars.example' -Destination '.dev.vars'
```

Open `.dev.vars` in your editor and replace its placeholders:

```dotenv
DATABASE_URL="your-Neon-test-branch-connection-string"
JWT_SECRET="a-long-secret-for-your-local-test"
JWT_EXPIRES_IN="90d"
CORS_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
```

Then run:

```powershell
npm run dev
```

Open the address printed by the development server. The local game can read and write the database named in `.dev.vars`, so use the test branch for practice. Local Durable Object storage is separate from deployed Cloudflare storage.

`.dev.vars` is ignored by Git; `.dev.vars.example` contains placeholders only. The local development server does not upload these values. [Cloudflare local secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

Run the local checks when changing the game:

```powershell
npm run verify
npm run test:cloudflare
npm run test:e2e --workspace=frontend
```

`verify` includes unit tests, lint, TypeScript and `npm run build`. The build creates the Cloudflare frontend and a Wrangler deployment dry run; it does not publish. Runtime and browser tests use isolated PGlite databases and synthetic secrets. The `build:cloudflare`, `dev:cloudflare` and `deploy:cloudflare` names remain aliases for the default Cloudflare commands.

## 4. Optional isolated Neon trial

The automatic setup uses your existing database unless an override takes precedence. A separate Neon test branch is useful if you want practice games to stay outside the existing dataset:

1. In the existing Neon project, open **Branches** and create `cloudflare-test` from the application's database branch.
2. Copy that branch's connection string, including `sslmode=require`.
3. Confirm its `skills` table contains Addition, Subtraction, Multiplication and Division.
4. For local practice, put the test connection string in `.dev.vars` and use `npm run dev`.

A Neon branch starts with the parent's schema/data, while later writes are isolated. It is independent of the Git branch; its compute and new data consume the project's free allowances. [Neon branching workflow](https://neon.com/docs/get-started/workflow-primer)

For a **separately deployed** database trial, use a different Worker name, such as `monomath-neon-test`. After browser login, enter the test database URL and a test JWT secret at Wrangler's prompts:

```powershell
npx wrangler secret put DATABASE_URL --name monomath-neon-test
npx wrangler secret put JWT_SECRET --name monomath-neon-test
npm run build
npx wrangler deploy --name monomath-neon-test
```

If Wrangler offers to create a missing Worker, check that the name is `monomath-neon-test`. Use its printed URL for the trial. This separates Cloudflare room storage and pending writes from `monomath-migration`. Avoid changing a deployed Worker's database while it still holds saved rooms or unsent evidence. Test-branch data is not automatically merged into the original database.

## 5. Check the deployed game before sharing it

Use synthetic test profiles, such as `CFTestA` and `CFTestB`, and record which database/Worker you are testing. Use two browser profiles, private windows or devices for two distinct players.

| Check | What to verify |
| --- | --- |
| Website and health | The game loads; opening `<your-worker-url>/api/health` returns `status: ok`. Health alone does not verify Neon access. |
| Guest/profile | Create a guest, refresh the page, and change nickname/avatar. It stays the same player. |
| Username/PIN | Claim a username; sign in from another browser. Wrong PIN is rejected and correct PIN restores the same profile. |
| Solo and bots | Start solo mode, play human turns, and let bots complete their turns. Questions, dice, purchases and scoreboard work. |
| Multiplayer | Create/join a room with two players, then repeat with four. Both screens receive the same room/turn updates. |
| Leave/rejoin | Disconnect a player briefly and reconnect within the game's grace period. The player returns to the correct room/seat. |
| Refresh during play | Refresh on a question or pending decision. Saved game state and remaining deadline resume correctly. |
| Timeout and hints | Let a question expire; request a hint on another question. No duplicate answer or extra mastery increase appears. |
| Game completion | Finish a match; final scores and mastery report agree across the participating screens. |
| Return visit | Start another match with the same profile. Stored mastery and independent answer evidence are loaded. |

For a deployment-update rehearsal, use **preview only**: keep a game open, redeploy the same preview Worker, reconnect, and check saved state/deadlines. This probes storage recovery without interrupting your real study.

The browser's network panel should show `/api/*` requests and a successful native WebSocket connection at `/ws` on the same Cloudflare origin.

## 6. Check that evaluation data actually reaches Neon

Gameplay can appear successful while evidence is still awaiting synchronization. After the smoke test, inspect the **correct Neon branch** in its SQL editor. The following queries are read-only. Replace the placeholders with your synthetic test profile/match IDs.

Find the test profile:

```sql
SELECT id, "displayName", "createdAt"
FROM players
WHERE "displayName" = 'CFTestA'
ORDER BY "createdAt" DESC
LIMIT 1;
```

Check answer evidence:

```sql
SELECT id, "gameId", difficulty, context, "isCorrect", "timedOut",
       "hintLevel", "timeMs", "pMasteryBefore", "pMasteryAfter",
       "predictedPCorrect", "opportunityIndex", "answeredAt",
       "questionData"->'timingPolicy' AS timing_policy,
       "questionData"->'hintUsage' AS hint_usage
FROM question_attempts
WHERE "playerId" = 'paste-test-player-id'
ORDER BY "answeredAt" DESC
LIMIT 30;
```

Check durable mastery:

```sql
SELECT s.name, m."pMastery", m.attempts, m.correct, m."lastPracticedAt"
FROM mastery_states m
JOIN skills s ON s.id = m."skillId"
WHERE m."playerId" = 'paste-test-player-id';
```

Check the finished match, using its durable `gameId` from an attempt above:

```sql
SELECT g.id, g.status, g."endedAt", p."turnOrder", p."playerId",
       p."isBot", p."finalNetWorth", p.rank,
       p."totalCorrect", p."totalQuestions"
FROM games g
JOIN game_players p ON p."gameId" = g.id
WHERE g.id = 'paste-durable-game-id'
ORDER BY p."turnOrder";
```

Verify these game-specific rules:

- Human answers appear once, even after reconnects or a retry.
- Attempts include pre-answer prediction, mastery before/after, receipt time, timing policy and hint usage.
- Timeout and hinted answers remain recorded, but do not advance stored mastery or its practice timestamp. They still count as lifetime opportunities.
- Returning-player difficulty uses independent, unhinted, non-timeout answers, rather than the full opportunity count.
- Bots contribute no learner question attempts; bot seats in finished matches have a null `playerId`.
- A completed match has its finished-game row and expected player seats.

The room first saves pending evidence in Cloudflare storage and retries Neon writes using stable event IDs. Each pending record is stored separately, with an ordered list in the room snapshot, so a backlog is not packed into one oversized storage value. PostgreSQL updates mastery and its evidence row in one transaction, deduplicating retries. Check Cloudflare errors and Neon rows if synchronization appears delayed. A gameplay test alone is not proof that an evaluation dataset is complete.

## 7. Stay within RM0 limits

Limits below were checked against official documentation on **10 October 2026**. Review both dashboards before the study because free allowances can change.

| Service/usage | Free allowance |
| --- | --- |
| Worker script requests | 100,000 per day; ordinary Worker CPU limit 10 ms per request |
| Static frontend assets | Free, unlimited asset requests; up to 20,000 files and 25 MiB per file |
| Durable Object compute | 100,000 request units and 13,000 GB-seconds per day |
| Durable Object SQLite storage | 5 million rows read/day, 100,000 rows written/day, 5 GB total stored data |
| Neon PostgreSQL | 1 GB storage/project, 100 CU-hours/project/month, 10 branches/project |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Neon Free plan update](https://neon.com/blog/neon-free-plan-1-gb-per-project).

PIN hashing runs inside `ApiService`, where Durable Objects have a default **30-second CPU allowance**, rather than the outer Worker's 10 ms allowance. It retains bcrypt cost 10. [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Hibernating WebSockets and persisted alarms let idle rooms sleep while retaining state and deadlines. Alarms can execute more than once; saved state and idempotent writes handle retries. Active work, database waits, alarms and storage writes still consume allowances. Free-limit exhaustion can reject operations even while the static game screen still loads. [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

The 13,000 GB-second allowance corresponds to about **28.2 aggregate continuously active object-hours/day** at Cloudflare's documented 128 MB allocation. This is a rough budgeting calculation across room, API and player-directory objects, not a guarantee about playable room hours; hibernation and actual workload change consumption.

Neon scales idle compute to zero, so the first database request after inactivity can take longer. Avoid a permanent database keep-alive loop, which spends the compute allowance. Check storage, compute and network-transfer usage in Neon. [Neon compute management](https://neon.com/docs/manage/endpoints/)

**The proposal's 120 pupils are a total study sample, not a verified simultaneous capacity.** Rehearse the real number of pupils playing at once, the solo/multiplayer split, school Wi-Fi/devices, and one-hour evaluation schedule. Observe room latency, reconnects, missing writes and account usage. Schedule manageable groups based on that evidence; the migration does not establish that 120 simultaneous pupils fit the free quotas.

## 8. The `main` backup and branch deletion

The original Render code and its deployment instructions remain on **`main`**. Keep the existing Render services tied to that branch. This branch contains only the Cloudflare application; returning to the old implementation means using the existing `main` deployment or checking out `main`, not deploying `migration` to Render. Each deployment uses its own complete website/server pair.

**Git branches, deployed applications and database data have separate lifetimes.** Deleting `migration` on GitHub would remove that Git branch reference. It would not delete `monomath-migration` from Cloudflare, remove its Durable Object storage, stop the existing Render deployment, or undo synchronized Neon writes. Retiring a Worker requires a separate Cloudflare action.

**A code rollback does not undo database writes.** With the shared Neon database, successfully synchronized player profiles, mastery and question evidence remain available under the existing schema. Live Cloudflare rooms and their pending evidence remain in Durable Objects; unfinished matches do not transfer to the `main` implementation. Check synchronization before retiring the Cloudflare deployment.

## 9. Optional automatic deploys from GitHub

The first playable link does not require GitHub integration. Later, you can connect the deployed Worker to your repository in **Workers Builds** and set:

| Setting | Value |
| --- | --- |
| Repository root | The monorepo root |
| Production branch | `migration` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Other-branch preview builds | Disabled initially |

Cloudflare defaults to the repository's default branch, so explicitly select `migration` for this Worker. Pushing to that selected branch then runs the configured build/deploy commands. Keep database/JWT settings as Worker runtime secrets; they are not frontend build variables. [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [build branch selection](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)

Workers Builds Free currently includes **3,000 build minutes/month**, **one concurrent build**, and a **20-minute build timeout**. Local `npm run deploy` does not use this hosted build allowance. [Build limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
