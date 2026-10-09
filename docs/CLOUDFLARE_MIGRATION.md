# MonoMath: manual Cloudflare deployment and Render fallback

This guide deploys the **`migration` branch** to Cloudflare while keeping **`main` as the Render backup**. Run the commands yourself when you are ready to publish. Building and testing locally do not publish the game.

The intended free setup is:

| Part | Service | What it does |
| --- | --- | --- |
| Game website | Cloudflare Worker Static Assets | Serves the React/Vite frontend |
| Live multiplayer | Cloudflare SQLite-backed `GameRoom` Durable Objects | Owns each room, game state, WebSockets, saved deadlines and pending database writes |
| Login/profile API | SQLite-backed `ApiService` Durable Objects | Runs the existing guest/profile/username/PIN flows |
| Player room membership | SQLite-backed `PlayerDirectory` Durable Objects | Coordinates one profile's room claims across browser tabs/devices and room objects |
| Permanent database | Your existing Neon PostgreSQL database | Keeps player identities, BKT mastery, question evidence and finished matches |
| Backup deployment | Existing Render services on `main` | Keeps the original Node/Socket.IO deployment available |

The frontend, `/api/*`, and `/ws` share one Cloudflare URL. This is a **Workers deployment**, using the existing `wrangler.jsonc`; you do not need a separate Cloudflare Pages project, Supabase project or paid domain.

Neon keeps the current Prisma-managed schema. The Cloudflare adapter uses Neon's HTTP SQL driver; Render keeps Prisma 5. **This migration requires no PostgreSQL schema migration or database reset.** The `new_sqlite_classes` entry in `wrangler.jsonc` creates three Cloudflare classes: `GameRoom`, `ApiService` and `PlayerDirectory`, separately from Neon. Each object owns its own storage; the directory coordinates a player's room membership across objects.

## 1. Prepare the migration branch

Install Node.js **24** and open PowerShell in the project folder:

```powershell
Set-Location 'D:\Documents\BKT'
git branch --show-current
node --version
npm ci
```

The branch output should be `migration`, and the Node output should begin with `v24.`. If you are on another branch, save any unfinished work before switching to `migration`. Keep Render's configured branch as `main`.

Run the local checks:

```powershell
npm run verify
npm run test:cloudflare
npm run build:cloudflare
```

`test:cloudflare` uses synthetic fixtures and isolated PostgreSQL/PGlite and Cloudflare test storage. It does not require your production database. `build:cloudflare` builds the frontend for native WebSockets and creates a Wrangler dry-run bundle; it does not deploy.

Keep `wrangler.jsonc`'s Worker name, Durable Object class names, and migration tag stable after deployment. Renaming them can select different storage rather than upgrading your existing rooms.

## 2. Choose the database for the first test

For a production deployment, reuse the **existing Neon `DATABASE_URL`** used by the Render backend. Use the application's connection string, including `sslmode=require`. Cloudflare does not require `DIRECT_URL`; that remains a Prisma migration setting for the Node setup.

For your first manual trial, a **Neon test branch** is recommended:

1. In Neon, open the existing project, then **Branches**.
2. Create a branch such as `cloudflare-test` from the existing application branch.
3. Select that test branch when copying its connection string.
4. Check that its `skills` table contains Addition, Subtraction, Multiplication and Division.

A Neon branch starts with its parent's schema/data, and later writes are isolated from the parent. It is a database branch, independent of the Git `migration` branch. Its compute and new data still consume project allowances. [Neon branching workflow](https://neon.com/docs/get-started/workflow-primer)

Use a separate Cloudflare Worker named **`monomath-preview`** for this trial. Deploy the real game as **`monomath`** later. This separates room storage and pending writes as well as the databases. Avoid changing a Worker from the test database to production while it still has saved test rooms or unsent evidence.

## 3. Try Cloudflare locally

For a quick browser trial that requires **no Neon credentials**, run:

```powershell
npm run dev:cloudflare:test
```

Open **http://127.0.0.1:8787**. This runs the actual Cloudflare game runtime with a temporary PostgreSQL/PGlite database and synthetic secrets. It blocks external database access, reads no project secrets, and loses its test data when you stop it with Ctrl+C. Use this first for solo, multiplayer, bots and reconnect checks. It does not test the deployed Cloudflare account or real Neon connectivity.

For a local trial connected to your **Neon test branch**, follow the separate `.dev.vars` setup below.

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
npm run dev:cloudflare
```

Open the address printed by the development server. The local game can read and write the database named in `.dev.vars`, so use the test branch for practice. Local Durable Object storage is separate from deployed Cloudflare storage.

`.dev.vars` is ignored by Git; `.dev.vars.example` contains placeholders only. Local values are not automatically uploaded as production secrets. [Cloudflare local secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 4. Sign in to Cloudflare and deploy

Create or use a Cloudflare account with the **Workers Free** plan. The configuration uses SQLite-backed Durable Objects, which are supported on Free. Keep your Neon project on Free too. [Durable Objects plan support](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Authenticate from the project root:

```powershell
npx wrangler login
```

Wrangler opens a browser to sign in and authorize your terminal. Select the intended account if you have more than one. This command does not deploy the game. [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)

### Optional preview using the Neon test branch

Enter the test branch's connection string and a preview JWT secret at the prompts:

```powershell
npx wrangler secret put DATABASE_URL --name monomath-preview
npx wrangler secret put JWT_SECRET --name monomath-preview
npm run build:cloudflare
npx wrangler deploy --name monomath-preview
```

If Wrangler offers to create the missing Worker, check that its name is `monomath-preview`. The `--name` option selects that Worker; it does not alter your Render deployment. Secret updates can deploy a Worker version immediately, so treat these as publishing operations and perform them outside a running study. [Wrangler secret commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-put)

Use the preview URL printed by Wrangler for the checks below.

### Production using the existing Neon database

Enter these values at the prompts:

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npm run deploy:cloudflare
```

For `DATABASE_URL`, use the existing application's Neon connection string. For `JWT_SECRET`, use **the same secret as the existing Render backend**. This allows existing signed player tokens to identify the same database profiles. Changing the secret invalidates those tokens. `JWT_EXPIRES_IN` is already set to `90d` in the configuration.

The default Worker name is `monomath`. `deploy:cloudflare` builds the Cloudflare frontend and publishes the Worker/assets. Save the exact `https://monomath.<your-account>.workers.dev` URL printed by Wrangler. The shared origin normally needs no production `CORS_ORIGIN` setting.

### Existing players when the website URL changes

The same database and JWT secret preserve server-side identities. However, browsers store remembered profiles separately for each website origin. The new `workers.dev` website cannot automatically read the old Render website's local storage.

For a player who must retain existing progress, claim a username and six-digit PIN on the old website first, then sign in with those details on Cloudflare. Choosing “new player” on the new origin creates a separate profile. Verify identity before collecting study data.

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

The browser's network panel should show `/api/*` requests and a successful WebSocket connection at `/ws` on the same Cloudflare origin. The Cloudflare build uses native WebSocket events; the Render backup uses Socket.IO. Keep each frontend paired with its matching backend.

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

## 8. Return to Render if needed

Keep the existing Render deployment available until Cloudflare passes both gameplay and persistence checks.

1. End or postpone active Cloudflare sessions and check that their evidence has synchronized to Neon.
2. In Render, select **`main`** for the existing services and redeploy that branch if necessary.
3. Keep the previous Render environment values, including `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, allowed frontend origins and frontend API/Socket.IO URLs.
4. Open the original Render frontend URL and test guest/sign-in, solo and multiplayer.
5. Share the Render frontend URL with players. Existing browser profiles are tied to that origin; use claimed credentials if a player needs to move an identity between origins.

Do not point the original Render/Socket.IO frontend at the Cloudflare native-WebSocket backend. Restore the matching Render frontend/backend pair. The Cloudflare build commands and deployment settings belong to `migration`; the backup on `main` retains its existing Render configuration.

**A code rollback does not undo database writes.** If both deployments use the existing Neon database, successfully synchronized Cloudflare identities, mastery and evidence remain there and use the existing schema. A Neon test branch's data stays in that branch and is not automatically merged into production. Live Cloudflare rooms are stored in Durable Objects and do not transfer to Render, so an unfinished match cannot resume there. Keep Cloudflare pending evidence available until its synchronization or a deliberate recovery is complete.
