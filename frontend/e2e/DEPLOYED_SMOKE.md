# Deployed Cloudflare smoke test

From the project root, point the existing browser checks at the deployed Worker:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://YOUR-WORKER.workers.dev'
$env:PLAYWRIGHT_FINISH_SYNTHETIC_GAMES = '1'
npm run test:e2e --workspace=frontend
Remove-Item Env:PLAYWRIGHT_BASE_URL
Remove-Item Env:PLAYWRIGHT_FINISH_SYNTHETIC_GAMES
```

This checks the real website, guest creation, separate multiplayer identities,
room readiness, consecutive turns, reconnect without replaying a roll, bot
configuration/autonomous turns, and direct game-page recovery. It creates three
synthetic guest profiles and two game rooms. Profiles have a unique `CF` prefix
for each test. Any math answers can create real database evidence.

Each game test saves and attaches `smoke-created-data.json` in its directory under
`frontend/test-results`. The file contains the exact profile UUIDs returned by
the server, display names, origin, timestamps, room codes and public game IDs.
It contains no authentication tokens or database credentials. Save these files
before another browser run clears the previous test results.

The finish option continues only these recorded profiles through ordinary game
events until both synthetic matches finish. Bot decisions and timers remain under
server control. Each host then starts a fresh lobby, which uses the existing
required flush of the old room's pending database writes, and leaves that temporary
lobby. Successful manifests record `completedAt`, `outboxFlushedAt`, and the
temporary lobby's confirmed departure. Completion is bounded to three minutes per
match; if it fails, keep the profile allowlist and do not delete live profiles.

There is no public account or game deletion API. Cleanup must use private server
and database access with these exact UUIDs as an allowlist. Never delete profiles
by nickname or by the `CF` prefix. Deleting a profile cascades its mastery and
question evidence, but match-history seats use `ON DELETE SET NULL`; removing a
match requires checking that every human seat belongs to the recorded UUIDs.

Close or expire the recorded room runtimes and drain their durable pending writes
before database cleanup. Browser closure alone leaves live game deadlines running.
Deleting profiles while these rooms can still write would cause foreign-key
failures and leave retries in the room outbox. If private room cleanup is
unavailable, report the recorded UUIDs for later cleanup and keep their evidence
out of study exports until cleanup is complete.
