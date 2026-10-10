# Gameplay runtime and recovery

## Turn presentation

The server schedules one bot action at a time and computes it from the latest
match state after its presentation delay. It does not plan a whole turn as future
state snapshots. A player's response therefore cannot be overwritten by an old
bot plan, and questions are created when the landing event actually begins.

All connected, non-bankrupt human accounts seated in the game acknowledge a roll after the
dice settle and the last token hop completes, including viewers of a bot turn.
Signals carry the roll ID; stale or duplicate signals cannot advance another
roll. Disconnecting viewers leave the required set. The existing 12-second
movement deadline remains the fallback for missing signals and hidden tabs.

The visual dice roll is bounded at 4.5 seconds. Once both dice show the intended
upper face and remain nearly motionless for 200 milliseconds, token movement
begins without waiting for the physics sleep cooldown. Token steps take 280
milliseconds, and each physical token hop takes 220 milliseconds. These are
presentation settings; they do not change the 30/45/60-second pupil question
windows. A resolved bot-turn duel remains visible for six seconds before turn
advancement.

A jailed player's next turn begins with Math Escape, Pay Bail and Wait choices.
No preliminary Roll Dice click is required. The existing maximum sentence still
automatically releases the player and starts their movement roll.

## Browser work

Dice rendering and physics pause when idle. Token scenes render on demand, and
movement allocates timers only while positions are changing. Money or status
updates do not restart hop timers. Pixel density is capped at 1.5, and the 3D
scenes load separately from the gameplay controls. A small validated throw bank
replaces synchronous physics simulations used to choose each dice throw.

Basic dice and coloured player markers cover unavailable WebGL and scene loading
or rendering failures. The board's bounded presentation remains responsible for
movement ordering with either visual mode. Normal supported browsers retain the
3D dice and tokens.

## Questions and connection recovery

The help cue stays inside a scrollable question panel. Answered questions are
replaced by one compact feedback card containing the outcome, reward and worked
line, with a Continue button and a six-second automatic hold. Redundant personal
answer/reward toasts are removed. Each learner's worked feedback is displayed
after the duel settles and remains private. During a duel reveal, only the active
player sees Continue; the defending owner and spectators have no dismissal
button. The server broadcasts the active player's Continue to close that reveal
for the whole table. Moving to the next player's turn also clears it, including
a turn that begins with jail choices. Question and duel IDs scope timers and
dismissals, so an older dismissal cannot close a new question or duel.

Disconnected clients show a recovery status and do not queue gameplay actions for
later replay. Reconnection requests the authoritative match state. Deadlines
continue on the server during a connection interruption; reconnecting does not
grant additional question time.

## Hosting limits

On the `migration` branch, Cloudflare hosts the website, API and live game.
Each `GameRoom` Durable Object saves match state, absolute deadlines and pending
research writes in durable SQLite-backed storage. WebSocket hibernation lets
idle rooms sleep; waking a room restores its state and remaining deadlines.
Persisted alarms continue deadline processing and retry evidence synchronization
with Neon. Player identity and long-term learning records remain in PostgreSQL.

Stable event IDs make retried evidence writes idempotent, and mastery changes
commit with their corresponding question rows. Local Cloudflare/workerd tests
exercise hibernation, reconnects, database outages and durable recovery. See the
[Cloudflare validation record](CLOUDFLARE_VALIDATION.md) for the tested behavior
and its limits.

Network delay and browser work can still affect play. Cloudflare and Neon Free
have finite request, compute and storage allowances; recovery does not establish
a simultaneous-player capacity. Use the
[Cloudflare setup and evaluation guide](CLOUDFLARE_MIGRATION.md) to check usage
and rehearse the intended school-network workload. The original Render
implementation remains on `main`.

## Historical verification on 6 October 2026

The following 6 and 8 October observations were recorded with the earlier
Node/Socket.IO implementation. They preserve the original browser measurements;
they are not live Cloudflare performance measurements.

The full checks passed: backend lint/types/build and 296 tests in 31 suites;
frontend lint/types/build and 40 tests in 11 suites. Browser debugging used the
real application routes, Socket.IO and game engine. Only guest identity storage
was replaced locally, and research database writes were disabled. Hint layouts
and repeatable encounters used controlled local game states, followed by real
button interactions; a three-bot round used the normal lobby and game controls.

Under Chromium's four-times CPU slowdown, observed bot roll-to-landing phases
took about 6.9–7.7 seconds, with no following bot roll before the prior landing.
These measurements describe the test browser and are not a device-wide frame
rate guarantee.

The idle draw counter recorded 5,687 WebGL draws over 2,015 milliseconds before
the cleanup and zero draws over 2,018 milliseconds afterward. The normal 3D
board remained visible in the browser screenshot. With WebGL disabled, all four
player markers and basic dice remained visible; a maximum 12-space roll reached
its card event after about 7.95 seconds with no page errors. Losing an already
running graphics context also switched to the basic board without page errors.

Two consecutive owner defences both began with 30 seconds. An explicit game
socket interruption displayed the reconnect status and restored the same
question, hint and deadline with all four answer choices enabled. Final layouts
were visually reviewed at desktop, tablet, 320-pixel phone and short landscape
sizes. Screenshots and trace data are retained in the local visualization folder.

The built gameplay-controls chunk changed from 3,205,501 bytes to 53,850 bytes.
The 3D and physics dependencies now load in separate chunks, so controls can
appear before those scenes finish loading. Those dependencies remain sizeable;
the split does not imply a comparable reduction in total downloaded bytes.

## Historical verification on 8 October 2026

Lint, typechecks and production builds passed, together with 52 frontend tests
and 313 backend tests. An isolated test runtime used the real game engine and
Socket.IO handlers with fixture accounts and database persistence disabled.

Three simultaneous Chromium screens confirmed that only the active player sees
duel Continue, the defending owner retains private feedback, and one Continue
closes all three panels. Bot Ali/May duels had no spectator buttons. Both human
and bot turn advancement exposed jail choices directly, and Math Escape opened
the live question. Desktop and 390-pixel layouts were visually checked.

With the 3D scene already loaded, one observed dice roll completed in 2,175 ms
and its first token step began 31 ms later. This is a local test measurement,
not a timing guarantee across devices. Browser checks recorded no page or
console errors; screenshots and the report are retained in the local
visualization folder.
