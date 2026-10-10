import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect as baseExpect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameState, MathChallenge, PublicDuelState } from '../src/features/game/types/game.types';

const finishSyntheticGames = process.env.PLAYWRIGHT_FINISH_SYNTHETIC_GAMES === '1';
// Live routing includes authentication and two WebSocket handshakes. Keep the
// native handshake limits, while allowing them to finish before UI assertions.
const expect = baseExpect.configure({ timeout: 15_000 });

test.describe('Cloudflare game transport', () => {
  test.setTimeout(finishSyntheticGames ? 360_000 : 120_000);

  test('two separate players share a room, recover their seats, and take consecutive turns', async ({ browser, baseURL }, testInfo) => {
    const manifest = await createSmokeManifest(testInfo, baseURL);
    const hostName = `${manifest.label}Host`;
    const guestName = `${manifest.label}Guest`;
    const hostContext = await browser.newContext({ baseURL });
    const guestContext = await browser.newContext({ baseURL });
    try {
      const host = await hostContext.newPage();
      const guest = await guestContext.newPage();
      const hostProbe = await observeConnection(host);
      const guestProbe = await observeConnection(guest);

      await createPlayer(host, hostName, manifest);
      await host.getByRole('button', { name: /Host a Game/ }).click();
      await expect(host.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
      const roomCode = (await host.locator('.room-code-value').innerText()).trim();
      await manifest.recordRoom(roomCode);

      await createPlayer(guest, guestName, manifest);
      await guest.getByLabel('Room Code', { exact: true }).fill(roomCode);
      await guest.getByRole('button', { name: /Join Game/ }).click();
      await expect(guest.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
      await expect(host.locator('.player-slot.is-me')).toContainText(hostName);
      await expect(guest.locator('.player-slot.is-me')).toContainText(guestName);
      await expect(host.locator('.players-grid')).toContainText(guestName);

      // A reload goes through the gateway again and must restore the same room.
      await guest.reload();
      await expect(guest.locator('.room-code-value')).toHaveText(roomCode);
      await expect(guest.locator('.player-slot.is-me')).toContainText(guestName);
      await guest.getByRole('button', { name: 'Ready Up', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Start Game' })).toBeEnabled();
      await host.getByRole('button', { name: 'Start Game' }).click();
      await expect(host).toHaveURL(new RegExp(`/game\\?code=${roomCode}`));
      await expect(guest).toHaveURL(new RegExp(`/game\\?code=${roomCode}`));
      await expect(host.getByRole('button', { name: 'Roll Dice', exact: true })).toBeVisible();
      await expect(guest.locator('.turn-banner')).toContainText(`${hostName}'s Turn`);

      const firstState = hostProbe.state!;
      await manifest.recordRoom(roomCode, firstState);
      expect(firstState.players.map((player) => player.name)).toEqual([hostName, guestName]);
      expect(firstState.players[0].playerId).not.toBe(firstState.players[1].playerId);

      await host.getByRole('button', { name: 'Roll Dice', exact: true }).click();
      await finishHumanTurn(host, hostProbe);
      await expect.poll(() => guestProbe.state?.turnPhase).toBe('END_TURN');
      const settledState = hostProbe.state!;
      const hostStateCount = hostProbe.states.length;
      const rollCount = hostProbe.sent.filter((frame) => frame.event === 'game:roll').length;

      // Close the real browser socket, leaving its page and local identity intact.
      // Recovery must fetch current state without replaying the previous roll.
      await interruptConnection(host);
      await expect.poll(() => hostProbe.states.length).toBeGreaterThan(hostStateCount);
      await expect(host.getByRole('heading', { name: 'Reconnecting…' })).toHaveCount(0);
      expect(hostProbe.state?.players).toEqual(settledState.players);
      expect(hostProbe.state?.currentPlayerIndex).toBe(settledState.currentPlayerIndex);
      expect(hostProbe.state?.diceRollId).toBe(settledState.diceRollId);
      expect(hostProbe.sent.filter((frame) => frame.event === 'game:roll')).toHaveLength(rollCount);

      await host.getByRole('button', { name: 'End Turn', exact: true }).click();
      await expect(guest.getByRole('button', { name: 'Roll Dice', exact: true })).toBeVisible();
      await expect(host.locator('.turn-banner')).toContainText(`${guestName}'s Turn`);
      await guest.getByRole('button', { name: 'Roll Dice', exact: true }).click();
      await finishHumanTurn(guest, guestProbe);
      await expect.poll(() => hostProbe.state?.diceRollId).toBe(guestProbe.state?.diceRollId);
      expect(hostProbe.errors).toEqual([]);
      expect(guestProbe.errors).toEqual([]);
      expect(hostProbe.sent.every((frame) => typeof frame.actionId === 'string')).toBe(true);
      expect(guestProbe.sent.every((frame) => typeof frame.actionId === 'string')).toBe(true);
      if (finishSyntheticGames) {
        await finishSyntheticMatch([
          { page: host, probe: hostProbe, playerId: firstState.players[0].playerId },
          { page: guest, probe: guestProbe, playerId: firstState.players[1].playerId },
        ], manifest);
      }
    } finally {
      await hostContext.close();
      await guestContext.close();
      await manifest.attach();
    }
  });

  test('a solo player can configure a bot, play, and recover after the bot advances', async ({ page, baseURL }, testInfo) => {
    const manifest = await createSmokeManifest(testInfo, baseURL);
    const soloName = `${manifest.label}Solo`;
    try {
      const probe = await observeConnection(page);
      await createPlayer(page, soloName, manifest);
      await page.getByRole('button', { name: /Host a Game/ }).click();
      await expect(page.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
      const roomCode = (await page.locator('.room-code-value').innerText()).trim();
      await manifest.recordRoom(roomCode);
      await page.locator('.bot-difficulty-select').selectOption('easy');
      await page.getByRole('button', { name: 'Add Bot', exact: true }).click();
      await expect(page.locator('.player-slot.is-bot')).toHaveCount(1);
      await expect(page.locator('.bot-difficulty-badge')).toHaveText('easy');
      await page.getByRole('button', { name: /^Remove / }).click();
      await expect(page.locator('.player-slot.is-bot')).toHaveCount(0);
      await page.locator('.bot-difficulty-select').selectOption('medium');
      await page.getByRole('button', { name: 'Add Bot', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Start Game' })).toBeEnabled();
      await page.getByRole('button', { name: 'Start Game' }).click();
      await expect(page.getByRole('button', { name: 'Roll Dice', exact: true })).toBeVisible();
      await expect(page.locator('.panel-player__bot-tag')).toHaveText(' (Bot)');
      await manifest.recordRoom(roomCode, probe.state!);

      await page.getByRole('button', { name: 'Roll Dice', exact: true }).click();
      await finishHumanTurn(page, probe);
      const humanRollId = probe.state!.diceRollId;
      await page.getByRole('button', { name: 'End Turn', exact: true }).click();
      await expect.poll(() => probe.botActions, { timeout: 40_000 }).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: /^(Roll Dice|Math Escape)$/ })).toBeVisible({ timeout: 50_000 });
      expect(probe.state!.diceRollId).toBeGreaterThan(humanRollId);
      expect(probe.state!.players[probe.state!.currentPlayerIndex].name).toBe(soloName);

      // Direct game-page reload must restore the game rather than create a lobby.
      const beforeReload = probe.state!;
      await page.reload();
      // A restored nonzero diceRollId can remount the previous dice animation.
      // Allow the existing six-second visual recovery guard to finish, too.
      await expect(page.getByRole('button', { name: /^(Roll Dice|Math Escape)$/ })).toBeVisible({ timeout: 15_000 });
      expect(probe.state?.diceRollId).toBe(beforeReload.diceRollId);
      expect(probe.state?.players).toEqual(beforeReload.players);
      expect(probe.errors).toEqual([]);
      if (finishSyntheticGames) {
        await finishSyntheticMatch([
          { page, probe, playerId: beforeReload.players.find((player) => !player.isBot)!.playerId },
        ], manifest);
      }
    } finally {
      await manifest.attach();
    }
  });
});

interface EventFrame {
  event?: string;
  data?: unknown;
  actionId?: string;
}

interface ConnectionProbe {
  state?: GameState;
  states: GameState[];
  sent: EventFrame[];
  botActions: number;
  errors: unknown[];
  challenge?: MathChallenge;
  duel?: PublicDuelState | null;
  roomCode?: string;
  removedRoomCode?: string;
}

async function observeConnection(page: Page): Promise<ConnectionProbe> {
  const probe: ConnectionProbe = { states: [], sent: [], botActions: 0, errors: [] };
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('framesent', ({ payload }) => {
      const frame = parseFrame(payload);
      if (frame) probe.sent.push(frame);
    });
    socket.on('framereceived', ({ payload }) => {
      const frame = parseFrame(payload);
      if (frame?.event === 'game:state') {
        const data = frame.data as { state: GameState };
        probe.state = data.state;
        probe.states.push(data.state);
        if (data.state.turnPhase === 'ROLL_PHASE' || data.state.turnPhase === 'MOVING') probe.duel = null;
      }
      if (frame?.event === 'game:bot-action') probe.botActions += 1;
      if (frame?.event === 'game:challenge') probe.challenge = (frame.data as { challenge: MathChallenge }).challenge;
      if (frame?.event === 'game:duel' || frame?.event === 'game:duel-result') probe.duel = (frame.data as { duel: PublicDuelState }).duel;
      if (frame?.event === 'game:duel-dismissed') probe.duel = null;
      if (frame?.event === 'room:update') probe.roomCode = (frame.data as { code: string }).code;
      if (frame?.event === 'room:deleted') probe.roomCode = undefined;
      if (frame?.event === 'room:removed') probe.removedRoomCode = (frame.data as { code: string }).code;
      if (frame?.event === 'game:error' || frame?.event === 'room:error' || frame?.event === 'connect_error') {
        probe.errors.push(frame.data);
      }
    });
  });
  await page.addInitScript(() => {
    const nativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    (window as typeof window & { __mathopolySockets: WebSocket[] }).__mathopolySockets = sockets;
    window.WebSocket = class extends nativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    };
  });
  return probe;
}

function parseFrame(payload: string | Buffer): EventFrame | null {
  try { return JSON.parse(String(payload)) as EventFrame; } catch { return null; }
}

interface SmokeDataManifest {
  version: 1;
  label: string;
  test: string;
  origin: string;
  startedAt: string;
  profiles: { id: string; displayName: string; createdAt: string }[];
  rooms: {
    code: string; gameId?: string; gameStartedAt?: string;
    completedAt?: string; outboxFlushedAt?: string;
    temporaryLobby?: boolean; lobbyLeftAt?: string;
  }[];
}

async function createSmokeManifest(testInfo: TestInfo, baseURL?: string) {
  const data: SmokeDataManifest = {
    version: 1, label: `CF${randomUUID().slice(0, 6)}`, test: testInfo.title,
    origin: new URL(baseURL ?? 'http://127.0.0.1:8787').origin,
    startedAt: new Date().toISOString(), profiles: [], rooms: [],
  };
  const manifestPath = testInfo.outputPath('smoke-created-data.json');
  await mkdir(testInfo.outputDir, { recursive: true });
  const save = () => writeFile(manifestPath, `${JSON.stringify(data, null, 2)}\n`);
  await save();
  return {
    label: data.label,
    profileIds: () => data.profiles.map((profile) => profile.id),
    async recordProfile(id: string, displayName: string) {
      data.profiles.push({ id, displayName, createdAt: new Date().toISOString() });
      await save();
    },
    async recordCompletion(gameId: string, temporaryLobbyCode: string) {
      const room = data.rooms.find((candidate) => candidate.gameId === gameId);
      if (!room) throw new Error('The completed game was not recorded in the synthetic manifest.');
      room.completedAt = new Date().toISOString();
      room.outboxFlushedAt = room.completedAt;
      data.rooms.push({ code: temporaryLobbyCode, temporaryLobby: true, lobbyLeftAt: room.completedAt });
      await save();
    },
    async recordRoom(code: string, state?: GameState) {
      let room = data.rooms.find((candidate) => candidate.code === code);
      if (!room) { room = { code }; data.rooms.push(room); }
      if (state) { room.gameId = state.id; room.gameStartedAt = new Date(state.gameStartTime).toISOString(); }
      await save();
    },
    async attach() {
      await testInfo.attach('synthetic-profiles-and-rooms', { path: manifestPath, contentType: 'application/json' });
    },
  };
}

async function createPlayer(page: Page, name: string, manifest: Awaited<ReturnType<typeof createSmokeManifest>>): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Your Nickname').fill(name);
  const created = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/guest' && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const response = await created;
  expect(response.status(), 'Creating a guest profile should succeed').toBe(201);
  const result = await response.json() as { player: { id: string; displayName: string } };
  expect(result.player.id).toMatch(/^[0-9a-f-]{36}$/i);
  await manifest.recordProfile(result.player.id, result.player.displayName);
  await expect(page.getByRole('button', { name: /Host a Game/ })).toBeVisible();
}

async function interruptConnection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sockets = (window as typeof window & { __mathopolySockets: WebSocket[] }).__mathopolySockets;
    const socket = [...sockets].reverse().find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) throw new Error('No connected game socket to interrupt.');
    socket.close(1000, 'browser reconnect test');
  });
}

interface SyntheticActor {
  page: Page;
  probe: ConnectionProbe;
  playerId: string;
}

/** Ordinary authenticated game events, confined to the exact profiles created by this test. */
async function finishSyntheticMatch(
  actors: SyntheticActor[], manifest: Awaited<ReturnType<typeof createSmokeManifest>>,
): Promise<void> {
  const gameId = actors[0].probe.state!.id;
  const approvedIds = new Set(manifest.profileIds());
  const sent = new Set<string>();
  const commandOnce = async (actor: SyntheticActor, event: string, key: string, data: Record<string, unknown> = {}) => {
    const receipt = `${actor.playerId}:${event}:${key}`;
    if (sent.has(receipt)) return;
    if (await sendBrowserEvent(actor.page, event, { gameId, ...data })) sent.add(receipt);
  };

  await expect.poll(async () => {
    const state = actors[0].probe.state!;
    if (state.id !== gameId || state.players.some((player) => !player.isBot && !approvedIds.has(player.playerId))) {
      throw new Error('Autoplay refused a game containing an unapproved human profile.');
    }
    if (state.phase === 'FINISHED') return true;
    const key = `${state.round}:${state.currentPlayerIndex}:${state.turnPhase}:${state.diceRollId}`;
    if (state.turnPhase === 'MOVING') {
      for (const actor of actors) await commandOnce(actor, 'game:movement-complete', key, { diceRollId: state.diceRollId });
      return false;
    }
    if (state.turnPhase === 'MATH_DUEL') {
      for (const actor of actors) {
        const duel = actor.probe.duel;
        if (!duel || duel.resolution) continue;
        const side = [duel.challenger, duel.owner].find((candidate) => candidate.playerId === actor.playerId);
        if (side && !side.hasAnswered) await commandOnce(actor, 'game:duel-answer', duel.id, { selectedIndex: 0 });
      }
      return false;
    }
    const active = actors.find((actor) => actor.playerId === state.players[state.currentPlayerIndex].playerId);
    if (!active) return false; // Bots keep their normal server timers and decisions.
    const events: Partial<Record<GameState['turnPhase'], string>> = {
      ROLL_PHASE: 'game:roll', BUY_DECISION: 'game:skip-buy', CARD_DRAW: 'game:card-ack',
      JAIL_DECISION: 'game:jail-wait', SMART_BUY_CHALLENGE: 'game:smart-buy-answer',
      CARD_MATH_CHALLENGE: 'game:card-answer', JAIL_CHALLENGE: 'game:jail-answer',
      END_TURN: 'game:end-turn',
    };
    if (state.turnPhase === 'END_TURN' && active.probe.duel?.resolution) {
      await commandOnce(active, 'game:duel-continue', active.probe.duel.id, { duelId: active.probe.duel.id });
      return false;
    }
    const event = events[state.turnPhase];
    if (event) {
      const challenge = state.turnPhase.endsWith('CHALLENGE');
      await commandOnce(active, event, challenge ? `${key}:${active.probe.challenge?.id ?? ''}` : key,
        challenge ? { selectedIndex: 0 } : {});
    }
    return false;
  }, { timeout: 180_000, intervals: [200], message: 'The synthetic match should finish through normal gameplay' }).toBe(true);
  for (const actor of actors) expect(actor.probe.errors, 'Normal synthetic gameplay should not produce server errors').toEqual([]);

  // Starting a fresh lobby uses the existing room transition's required outbox
  // flush. Its update is delivered only after the finished room's writes drain.
  const host = actors[0];
  const oldRoomCode = gameId.replace(/^game_/, '');
  await sendBrowserEvent(host.page, 'room:create', {});
  await expect.poll(() => !!host.probe.roomCode && host.probe.roomCode !== oldRoomCode, { timeout: 30_000 }).toBe(true);
  const newRoomCode = host.probe.roomCode;
  if (!newRoomCode) throw new Error('The outbox-draining lobby transition did not complete.');
  const leaveSent = await sendBrowserEvent(host.page, 'room:leave', {});
  expect(leaveSent).toBe(true);
  // A resume after leave must reject the now-vacant seat, confirming that leave
  // committed without reserving another unnecessary lobby.
  await sendBrowserEvent(host.page, 'room:resume', { code: newRoomCode });
  await expect.poll(() => host.probe.removedRoomCode).toBe(newRoomCode);
  await manifest.recordCompletion(gameId, newRoomCode);
}

async function sendBrowserEvent(page: Page, event: string, data: Record<string, unknown>): Promise<boolean> {
  return page.evaluate(({ event, data }) => {
    const sockets = (window as typeof window & { __mathopolySockets: WebSocket[] }).__mathopolySockets;
    const socket = [...sockets].reverse().find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) return false;
    socket.send(JSON.stringify({ event, data, actionId: crypto.randomUUID() }));
    return true;
  }, { event, data });
}

/** Resolve whichever random landing the real server chose, using visible controls. */
async function finishHumanTurn(page: Page, probe: ConnectionProbe): Promise<void> {
  await expect.poll(() => probe.state?.turnPhase, { timeout: 30_000 }).not.toBe('ROLL_PHASE');
  for (let action = 0; action < 12; action += 1) {
    const phase = probe.state?.turnPhase;
    if (phase === 'MOVING' || phase === 'RESOLVE_TILE') {
      await expect.poll(() => probe.state?.turnPhase, { timeout: 30_000 }).not.toBe(phase);
    } else if (phase === 'BUY_DECISION') {
      const offerAttempted = probe.state?.pendingTileEvent?.bankOfferAttempted;
      await page.getByRole('button', { name: offerAttempted ? 'Skip Purchase' : 'Answer for Bank Offer', exact: true }).click();
      await expect.poll(() => probe.state?.turnPhase).not.toBe(phase);
    } else if (phase === 'CARD_DRAW') {
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await expect.poll(() => probe.state?.turnPhase).not.toBe(phase);
    } else if (phase === 'JAIL_DECISION') {
      await page.getByRole('button', { name: 'Wait', exact: true }).click();
      await expect.poll(() => probe.state?.turnPhase).not.toBe(phase);
    } else if (phase === 'CARD_MATH_CHALLENGE' || phase === 'SMART_BUY_CHALLENGE' || phase === 'JAIL_CHALLENGE') {
      await page.getByRole('button', { name: 'Help me start', exact: true }).click();
      await expect(page.locator('.question-help__cue')).toBeVisible();
      await page.locator('.column-option, .division-option').first().click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect.poll(() => probe.state?.turnPhase).not.toBe(phase);
    } else if (phase === 'END_TURN') {
      await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
      return;
    } else {
      throw new Error(`Unexpected phase in the first human turn: ${phase}`);
    }
  }
  throw new Error('The human turn did not reach END_TURN.');
}
