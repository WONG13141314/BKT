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

The visual dice roll is bounded at 4.5 seconds, token steps take 280 milliseconds,
and each physical token hop takes 220 milliseconds. These are presentation
settings; they do not change the 30/45/60-second pupil question windows. A
resolved bot-turn duel remains visible for six seconds before turn advancement.

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
after the duel settles and remains private. Question and duel IDs scope the timers, so an older dismissal cannot
close a new question.

Disconnected clients show a recovery status and do not queue gameplay actions for
later replay. Reconnection requests the authoritative match state. Deadlines
continue on the server during a connection interruption; reconnecting does not
grant additional question time.

## Hosting limits

These changes address observed gameplay ordering and browser work. They do not
establish the cause of every reported freeze or remove network latency. Render
documents that its free web service can spin down after 15 minutes without
inbound HTTP/WebSocket traffic and can restart at any time. See
[Render's free service documentation](https://render.com/docs/free).

This prototype holds active matches in server memory. A server restart loses the
active match even though player identity and persisted learning records remain
in PostgreSQL. Durable match recovery would require a separate persistence
change. This update requires no database migration and does not change BKT
parameters or the hint/timing evaluation policy.

## Verification on 6 October 2026

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
