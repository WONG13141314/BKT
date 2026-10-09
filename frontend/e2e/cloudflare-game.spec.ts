import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/features/game/types/game.types';

test.describe('Cloudflare game transport', () => {
  test.skip(process.env.PLAYWRIGHT_CLOUDFLARE !== '1', 'Run against the combined local Worker with PLAYWRIGHT_CLOUDFLARE=1.');
  test.setTimeout(120_000);

  test('two separate players share a room, recover their seats, and take consecutive turns', async ({ browser, baseURL }) => {
    const hostContext = await browser.newContext({ baseURL });
    const guestContext = await browser.newContext({ baseURL });
    try {
      const host = await hostContext.newPage();
      const guest = await guestContext.newPage();
      const hostProbe = await observeConnection(host);
      const guestProbe = await observeConnection(guest);

      await createPlayer(host, 'CFHost');
      await host.getByRole('button', { name: /Host a Game/ }).click();
      await expect(host.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
      const roomCode = (await host.locator('.room-code-value').innerText()).trim();

      await createPlayer(guest, 'CFGuest');
      await guest.getByLabel('Room Code', { exact: true }).fill(roomCode);
      await guest.getByRole('button', { name: /Join Game/ }).click();
      await expect(guest.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
      await expect(host.locator('.player-slot.is-me')).toContainText('CFHost');
      await expect(guest.locator('.player-slot.is-me')).toContainText('CFGuest');
      await expect(host.locator('.players-grid')).toContainText('CFGuest');

      // A reload goes through the gateway again and must restore the same room.
      await guest.reload();
      await expect(guest.locator('.room-code-value')).toHaveText(roomCode);
      await expect(guest.locator('.player-slot.is-me')).toContainText('CFGuest');
      await guest.getByRole('button', { name: 'Ready Up', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Start Game' })).toBeEnabled();
      await host.getByRole('button', { name: 'Start Game' }).click();
      await expect(host).toHaveURL(new RegExp(`/game\\?code=${roomCode}`));
      await expect(guest).toHaveURL(new RegExp(`/game\\?code=${roomCode}`));
      await expect(host.getByRole('button', { name: 'Roll Dice', exact: true })).toBeVisible();
      await expect(guest.locator('.turn-banner')).toContainText("CFHost's Turn");

      const firstState = hostProbe.state!;
      expect(firstState.players.map((player) => player.name)).toEqual(['CFHost', 'CFGuest']);
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
      await expect(host.locator('.turn-banner')).toContainText("CFGuest's Turn");
      await guest.getByRole('button', { name: 'Roll Dice', exact: true }).click();
      await finishHumanTurn(guest, guestProbe);
      await expect.poll(() => hostProbe.state?.diceRollId).toBe(guestProbe.state?.diceRollId);
      expect(hostProbe.errors).toEqual([]);
      expect(guestProbe.errors).toEqual([]);
      expect(hostProbe.sent.every((frame) => typeof frame.actionId === 'string')).toBe(true);
      expect(guestProbe.sent.every((frame) => typeof frame.actionId === 'string')).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('a solo player can configure a bot, play, and recover after the bot advances', async ({ page }) => {
    const probe = await observeConnection(page);
    await createPlayer(page, 'CFSolo');
    await page.getByRole('button', { name: /Host a Game/ }).click();
    await expect(page.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
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

    await page.getByRole('button', { name: 'Roll Dice', exact: true }).click();
    await finishHumanTurn(page, probe);
    const humanRollId = probe.state!.diceRollId;
    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
    await expect.poll(() => probe.botActions, { timeout: 40_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^(Roll Dice|Math Escape)$/ })).toBeVisible({ timeout: 50_000 });
    expect(probe.state!.diceRollId).toBeGreaterThan(humanRollId);
    expect(probe.state!.players[probe.state!.currentPlayerIndex].name).toBe('CFSolo');

    // Direct game-page reload must restore the game rather than create a lobby.
    const beforeReload = probe.state!;
    await page.reload();
    await expect(page.getByRole('button', { name: /^(Roll Dice|Math Escape)$/ })).toBeVisible();
    expect(probe.state?.diceRollId).toBe(beforeReload.diceRollId);
    expect(probe.state?.players).toEqual(beforeReload.players);
    expect(probe.errors).toEqual([]);
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
      }
      if (frame?.event === 'game:bot-action') probe.botActions += 1;
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

async function createPlayer(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Your Nickname').fill(name);
  const created = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/guest' && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect((await created).status(), 'Creating a guest profile should succeed').toBe(201);
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
