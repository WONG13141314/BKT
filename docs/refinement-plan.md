# Refinement plan: smooth start, smooth network, cleaner code

Status: **agreed with defaults on 2026-10-18.** All three steps done; work happens on the `optimization` branch.
Date: 2026-10-18

Each item says what the player sees today, why it happens, and the proposed fix.
Items are ordered by how much they help.

---

## 1. Game start: bots move before anyone can see the board

**What you see:** you press Start, and while "Setting up the board…" is still
showing, the bots have already rolled and moved.

**Why:** the server starts the first turn the moment Start is pressed. A bot
rolls after 0.8 s. Meanwhile each player's browser is still switching from the
lobby to the game page, reconnecting, fetching the game and drawing the 3D
dice and tokens. That takes 1–5 s on a normal laptop and longer on a weak one.

**Fix: a "ready check" on the server**

- After Start, the game waits in a short opening state. No bot acts, and no
  timer runs.
- Each player's browser sends `game:board-ready` once its 3D dice and board
  have drawn.
- The first turn begins when every human player is ready, or after **15 s**
  at most, so one slow or missing device can't block the table.
- Then a short **"Round 1 · Ali goes first"** banner (about 1.5 s), in the
  Monopoly card style, before the first roll.
- A player who refreshes mid-game is not affected. The ready check only runs
  once, at the start.

## 2. Remove the "Setting up the board…" screen

**What you want:** after entering the game, the 3D dice and board are simply
there and complete.

**Fix:**

- Keep the board hidden (not covered by a loading card) while the 3D scenes
  draw, then fade the whole table in at once when both are ready.
- Because of item 1, nothing happens on the table before the fade-in, so
  nothing is missed.
- The 3D code is already downloaded, and the dice physics compiled, while
  players wait in the lobby.
- The basic 2D fallback (no WebGL, or drawing takes too long) stays as it is,
  only without the text card.

## 3. End-turn timer starts while the answer card is still open

**What you see:** after answering a question, the 10 s End Turn timer is
already counting while the answer card is shown (up to 6 s). Only about 4 s
are left once the card closes.

**Fix:** when the turn goes to End Turn straight after a graded answer, the
server adds the answer-card time (6 s) to that deadline. That is the same rule
Math Escape already uses before its roll. You get the full 10 s after closing
the card.

---

## 4. Network: why the "Reconnecting…" panel pops up

I traced the connection code end to end. The server side is solid: timers
survive restarts, answers get a 2 s network grace, and you get one 60 s grace
per phase if you drop. The problems are mostly in **how quickly the page
reacts, and how loudly**.

### 4a. The panel shows on every tiny drop (biggest win, easy)

**Why:** the full-screen "Reconnecting…" panel appears the instant the socket
closes, even when the connection comes back half a second later. On phones
and school Wi-Fi, short drops are normal.

**Fix:**

| Time offline | What the player sees |
|---|---|
| 0–2 s | Nothing. Most drops recover here. |
| 2–8 s | A small "Reconnecting…" tag in the top bar. The game stays visible. |
| over 8 s | The current full panel. |

Action buttons are still disabled while offline, exactly as now.

### 4b. Recovery is slow after the phone was locked or the tab was hidden

**Why:** a dead connection is only noticed by the heartbeat, which can take up
to **60 s**. Retries also back off to 10 s between attempts.

**Fix:**

- When the tab becomes visible again, or the device comes back online, check
  the connection straight away: send a ping and reconnect if no pong arrives
  within 3 s.
- The first retry happens immediately. Later retries are 0.5 → 1 → 2 → 4 s,
  capped at 5 s, with a little randomness so devices don't retry in lockstep.

### 4c. Every connection waits for the database (also why "create room" is slow)

**Why:** each time a socket opens, including every reconnect, the server looks
the player up in Neon. Neon's free tier **sleeps after about 5 minutes idle**,
and waking it adds roughly 0.5–3 s. A weak network makes this worse.

**Fix:** the login token is already signed and checked first. After the first
lookup, the room remembers the player's name and avatar, so reconnects only
verify the token and skip Neon. Bans or deleted accounts are still checked on
the next full login, as they are today.

### 4d. Creating a room opens two connections

**Why:** today "Create room" does this:

1. The lobby socket connects to a temporary "session" room (one database
   lookup).
2. It asks for a new room, and the server reserves a code.
3. The server tells the browser to move, so the browser closes that socket
   and opens a second one to the new room (a second database lookup).
4. It repeats the request, and the player's room membership is saved.

That is two handshakes, two database lookups and about four internal hops.

**Fix:** when the room code is already known, connect straight to that room:
join, resume, and refreshing the game page (`/ws?room=CODE`). For "create",
reserve the code with one quick HTTP call first, then open the single socket
directly to the new room. Together with 4c, create room should drop from
several round trips (plus a possible Neon wake-up) to about two quick ones.

*As built:* the lobby socket is normally already open from sign-in, so
"create" keeps its single redirect. The reserving room is handed the host's
profile, so the redirected connection skips Neon. No new HTTP call was needed.

### 4e. Smaller broadcasts (optional, low priority)

Every state update is about 5 KB, and 3 KB of that is the board's tile list,
which never changes during a game. Send it once at the start and leave it out
of later updates. That is about 60% less data per move, which helps a little
on weak mobile data.

### Not changing

- Commands tapped while offline are **not** replayed later. Replaying an old
  roll or answer onto a newer turn would be wrong. The buttons are disabled
  instead, as now.
- The server rules, BKT evidence rules and research outbox stay as they are.

---

## 5. Codebase clean-up (no feature changes)

The code is already quite lean: only four runtime dependencies, and no old
Node/Socket.IO server left. The clean-up is about **splitting the few very
large files**, so they are easier to change for 3D later:

| File | Lines | Split into |
|---|---|---|
| `backend/src/sockets/game.handlers.runtime.ts` | 1,122 | timers and deadlines, bot turns, movement acknowledgement, away/autopilot, socket wiring |
| `backend/src/features/game/game.engine.ts` | 1,646 | turn flow, tiles and buying, cards, jail, duels, end of game |
| `frontend/src/features/game/pages/GamePage.tsx` | 778 | page layout, plus hooks for answer holds, movement and overlays |

I'll also remove unused exports and leftover comments.

*As built:*

- The engine is now `features/game/engine/` (setup, players, turn, landing,
  property, duel, cards, jail, scoring), and `game.engine.ts` re-exports the
  same public functions.
- The handlers runtime keeps the timers, bots and turn advancement (706
  lines). Learner commands moved to `game.socket.handlers.ts`, result
  messages to `game.emitters.ts`, and pure deadline helpers to
  `phase.deadlines.ts`.
- `GamePage.tsx` went from about 800 to 533 lines. The question and duel cards
  are in `useQuestionCards`, seat recovery in `useGameSeatRecovery`, the status
  screens and overlays in `GameStatusScreens.tsx`, and the board target in
  `utils/boardPresentation.ts`.

**Safety rule:** move code only. Don't change behaviour, keep every test
passing after each step (404 backend + 78 frontend + 11 Cloudflare checks),
and make it a separate commit from the fixes above.

---

## Suggested order

All steps go on the existing `optimization` branch, then to `main`.

| Step | Items | Status |
|---|---|---|
| 1 | 1, 2, 3: start pacing, no loading card, end-turn timer | Done |
| 2 | 4a, 4b, 4c, 4d: network smoothness | Done |
| 3 | 5: clean-up (split all three files) | Done |

Each step is tested (unit tests, Cloudflare checks and a browser playtest)
before it goes to `main`.

## Decisions (2026-10-18)

1. Ready-check cap: **15 s**.
2. Turn-order banner: **"Round 1 · X goes first" for 1.5 s**.
3. Reconnect panel: **2 s silent, small tag until 8 s, then the full panel**.
4. Clean-up: **split all three large files**.
5. 4e (smaller broadcasts): **skipped**.
