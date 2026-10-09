import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestRuntime } from './cloudflare-test-runtime.mjs';

/** Browser-compatible WS client, including the gateway's redirect/resume frames. */
class GameClient {
  frames = [];
  waiters = new Set();
  connections = new Set();
  generation = 0;

  constructor(origin, token, path = '/ws') {
    this.origin = origin;
    this.token = token;
    this.open(path);
  }

  open(path, resume) {
    const url = new URL(path, this.origin);
    assert.equal(url.origin, this.origin, 'Routing must stay on the game origin');
    assert.equal(url.pathname, '/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.token);
    this.endpoint = url;
    const generation = ++this.generation;
    const ws = new WebSocket(url);
    this.ws = ws;
    this.connections.add(ws);
    ws.addEventListener('message', ({ data }) => {
      if (generation !== this.generation) return;
      const frame = data === 'pong' ? { event: '__pong' } : JSON.parse(data);
      this.record(frame);
      if (frame.redirect) {
        assert.ok(frame.resume && typeof frame.resume.event === 'string');
        // The public routing protocol is deliberately independent of Socket.IO.
        this.open(frame.redirect, frame.resume);
        ws.close();
      } else if (frame.event === 'connect' && resume) {
        this.send(resume.event, resume.data ?? {});
      }
    });
    ws.addEventListener('close', ({ code, reason }) => {
      this.connections.delete(ws);
      if (generation === this.generation) this.record({ event: '__close', data: { code, reason } });
    });
    ws.addEventListener('error', () => {
      if (generation === this.generation) this.record({ event: '__error' });
    });
  }

  record(frame) {
    this.frames.push(frame);
    for (const waiter of [...this.waiters]) waiter.check();
  }

  mark() { return this.frames.length; }

  wait(event, predicate = () => true, after = 0, timeout = 10_000) {
    return new Promise((resolve, reject) => {
      let timer;
      const waiter = { check: () => {
        const found = this.frames.slice(after).find((frame) => frame.event === event && predicate(frame.data, frame));
        if (!found) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(found.data);
      } };
      timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${event}; received ${this.frames.slice(after).map((frame) => frame.event ?? (frame.redirect ? 'redirect' : 'ack')).join(', ')}`));
      }, timeout);
      this.waiters.add(waiter);
      waiter.check();
    });
  }

  send(event, data = {}, extra = {}) {
    assert.equal(this.ws.readyState, WebSocket.OPEN, `Connection must be open for ${event}`);
    this.ws.send(JSON.stringify({ event, data, actionId: randomUUID(), ...extra }));
  }

  async state(gameId) {
    const mark = this.mark();
    this.send('game:request-state', { gameId });
    return (await this.wait('game:state', (data) => data.state.id === gameId, mark)).state;
  }

  async close() {
    const sockets = [...this.connections];
    await Promise.all(sockets.map((ws) => new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(resolve, 2_000);
      ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.close();
    })));
  }
}

// This class is appended only to the isolated test bundle. Production exports
// contain no fixture endpoints, and requests here go directly through Miniflare.
const testRoomSource = `
export class TestGameRoom extends GameRoom {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/__test/snapshot') return new Response(JSON.stringify(this.snapshot()), { headers: { 'content-type': 'application/json' } });
    if (path === '/__test/patch' && request.method === 'POST') {
      const body = await request.json();
      return this.transact(() => {
        const state = this.service.getGameSync(body.gameId);
        if (!state) return new Response('Unknown test game', { status: 404 });
        Object.assign(state, body.patch);
        if (body.deferRetriesFor) this.retryAt = Date.now() + body.deferRetriesFor;
        if (body.activePosition !== undefined) state.players[state.currentPlayerIndex].position = body.activePosition;
        this.service.replaceState(body.gameId, state);
        this.gameHandlers.resume(this.io.asServer());
        return new Response(JSON.stringify(this.snapshot()), { headers: { 'content-type': 'application/json' } });
      });
    }
    if (path === '/__test/flush' && request.method === 'POST') {
      this.retryAt = 0;
      await this.alarm();
      return new Response(JSON.stringify(this.snapshot()), { headers: { 'content-type': 'application/json' } });
    }
    if (path === '/__test/requeue' && request.method === 'POST') {
      const event = await request.json();
      return this.transact(() => {
        this.outbox.push(event);
        this.retryAt = Date.now() + 100000;
        return new Response(JSON.stringify(this.snapshot()), { headers: { 'content-type': 'application/json' } });
      });
    }
    return super.fetch(request);
  }
}
`;

function assertPublicState(state) {
  for (const field of ['dbGameId', 'currentChallenge', 'challengeCardDeck', 'challengeCardIndex', 'phaseDeadlineFor']) {
    assert.equal(field in state, false, `${field} must remain server-only`);
  }
  assert.equal(state.duelState, null);
  for (const player of state.players) {
    for (const field of ['mastery', 'masteryStates', 'masteryPriors', 'skillAttempts', 'attemptHistory', 'recentQuestionFingerprints', 'recentIssuedSkills', 'lastQuestionDifficulty']) {
      assert.equal(field in player, false, `${field} must remain learner-private`);
    }
  }
}

function assertNoAnswer(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(['answer', 'correctAnswer', 'correctIndex', 'correctOptionIndex', 'missingValue'].includes(key), false, `${key} exposes a server answer`);
    assertNoAnswer(child);
  }
}

test('Cloudflare runtime preserves auth, multiplayer gameplay and durable recovery', { timeout: 150_000 }, async (t) => {
  const fixture = await createTestRuntime(0, { extraWorkerSource: testRoomSource, roomClassName: 'TestGameRoom' });
  const roomTest = async (roomCode, action, body) => {
    const namespace = await fixture.runtime.getDurableObjectNamespace('ROOMS', 'monomath-test');
    const response = await namespace.get(namespace.idFromName(`room:${roomCode}`)).fetch(`https://room/__test/${action}`, {
      method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const clients = new Set();
  const api = async (path, { token, method = 'GET', body } = {}) => {
    const response = await fetch(new URL(path, fixture.url), {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const guest = async (name) => {
    const response = await api('/api/auth/guest', { method: 'POST', body: { displayName: name, avatar: 'car' } });
    assert.equal(response.status, 201);
    assert.ok(response.data.token);
    assert.equal(response.data.player.displayName, name);
    assert.equal('pinHash' in response.data.player, false);
    return response.data;
  };
  const connect = async (identity, path) => {
    const client = new GameClient(fixture.url, identity.token, path);
    clients.add(client);
    await client.wait('connect');
    return client;
  };

  let hostIdentity;
  let guestIdentity;
  let host;
  let second;
  let code;
  let gameId;
  let moving;

  try {
    await t.test('HTTP health, guest/profile, claim and sign-in use isolated PostgreSQL', async () => {
      assert.deepEqual(await api('/api/health'), { status: 200, data: { status: 'ok', environment: 'production' } });
      hostIdentity = await guest('Test Host');
      guestIdentity = await guest('Test Guest');
      const patched = await api('/api/auth/me', { token: hostIdentity.token, method: 'PATCH', body: { displayName: 'Host Updated', avatar: 'dog' } });
      assert.equal(patched.status, 200);
      assert.equal(patched.data.player.id, hostIdentity.player.id);
      assert.equal(patched.data.player.avatar, 'dog');
      const claimed = await api('/api/auth/claim', { token: hostIdentity.token, method: 'POST', body: { username: 'test_host', pin: '123456' } });
      assert.equal(claimed.status, 200);
      assert.equal(claimed.data.player.isClaimed, true);
      const signedIn = await api('/api/auth/signin', { method: 'POST', body: { username: 'TEST_HOST', pin: '123456' } });
      assert.equal(signedIn.status, 200);
      assert.equal(signedIn.data.player.id, hostIdentity.player.id);
      hostIdentity = signedIn.data;
      assert.equal((await api('/api/auth/me', { token: hostIdentity.token })).data.player.displayName, 'Host Updated');
      assert.equal((await api('/api/auth/signin', { method: 'POST', body: { username: 'test_host', pin: '000000' } })).status, 401);
      assert.equal((await api('/api/auth/me')).status, 401);
    });

    await t.test('create/join follow gateway redirects; repeated actionId toggles readiness once', async () => {
      host = await connect(hostIdentity);
      second = await connect(guestIdentity);
      const createMark = host.mark();
      host.send('room:create');
      ({ code } = await host.wait('room:created', () => true, createMark));
      assert.match(code, /^[A-Z2-9]{6}$/);
      assert.ok(host.frames.slice(createMark).some((frame) => frame.redirect));
      assert.equal(host.endpoint.searchParams.get('room'), code);
      const joinMark = second.mark();
      second.send('room:join', { code });
      const joined = await second.wait('room:update', (room) => room.players.length === 2, joinMark);
      assert.ok(second.frames.slice(joinMark).some((frame) => frame.redirect));
      assert.equal(joined.hostId, hostIdentity.player.id);
      assert.equal(joined.players.find((player) => player.id === guestIdentity.player.id).isReady, false);
      const actionId = randomUUID();
      const readyMark = second.mark();
      second.send('room:ready', {}, { actionId });
      await second.wait('room:update', (room) => room.players.find((player) => player.id === guestIdentity.player.id).isReady, readyMark);
      const dedupMark = second.mark();
      second.send('room:ready', {}, { actionId });
      second.send('room:resume', { code });
      const resumed = await second.wait('room:update', () => true, dedupMark);
      assert.equal(resumed.players.find((player) => player.id === guestIdentity.player.id).isReady, true);
    });

    await t.test('brief disconnect resumes the same ready lobby seat', async () => {
      await second.close();
      second = await connect(guestIdentity);
      const mark = second.mark();
      second.send('room:resume', { code });
      const room = await second.wait('room:update', (value) => value.code === code, mark);
      assert.equal(room.players.length, 2);
      assert.equal(room.hostId, hostIdentity.player.id);
      assert.equal(room.players.find((player) => player.id === guestIdentity.player.id).isReady, true);
    });

    await t.test('a profile changing lobby in another tab releases its previous seat and transfers hosts', async () => {
      const moverIdentity = await guest('Tab Mover');
      const remainingIdentity = await guest('Old Member');
      const destinationIdentity = await guest('New Host');
      const originalTab = await connect(moverIdentity);
      const remaining = await connect(remainingIdentity);
      const destination = await connect(destinationIdentity);
      const originalMark = originalTab.mark();
      originalTab.send('room:create');
      const original = await originalTab.wait('room:created', () => true, originalMark);
      const joinMark = remaining.mark();
      remaining.send('room:join', { code: original.code });
      await remaining.wait('room:update', (room) => room.players.length === 2, joinMark);
      const destinationMark = destination.mark();
      destination.send('room:create');
      const target = await destination.wait('room:created', () => true, destinationMark);
      const newTab = await connect(moverIdentity);
      const removedMark = originalTab.mark();
      const transferMark = remaining.mark();
      const moveMark = newTab.mark();
      newTab.send('room:join', { code: target.code });
      await newTab.wait('room:update', (room) => room.code === target.code && room.players.length === 2, moveMark);
      await originalTab.wait('room:removed', (data) => data.code === original.code, removedMark);
      const oldRoom = await remaining.wait('room:update', (room) => room.hostId === remainingIdentity.player.id, transferMark);
      assert.equal(oldRoom.players.length, 1);
      assert.equal(oldRoom.players[0].id, remainingIdentity.player.id);
      assert.equal(oldRoom.players[0].isReady, false, 'Host transfer preserves the remaining seat readiness');
      const explicitCreateMark = destination.mark();
      const targetTransferMark = newTab.mark();
      destination.send('room:create', {});
      const replacement = await destination.wait('room:created', () => true, explicitCreateMark);
      assert.notEqual(replacement.code, target.code, 'Explicit Create Room must allocate a fresh waiting lobby');
      const transferred = await newTab.wait('room:update', (room) => room.code === target.code && room.hostId === moverIdentity.player.id, targetTransferMark);
      assert.equal(transferred.players.length, 1);
      assert.equal(transferred.players[0].id, moverIdentity.player.id);
      assert.equal((await roomTest(original.code, 'snapshot')).rooms.rooms[0].players.some((player) => player.id === moverIdentity.player.id), false);
      assert.equal((await roomTest(target.code, 'snapshot')).rooms.rooms[0].players.some((player) => player.id === destinationIdentity.player.id), false);
    });

    await t.test('two humans start, roll and retain one movement acknowledgement across hibernation', async () => {
      const startMark = host.mark();
      const secondMark = second.mark();
      host.send('room:start');
      await Promise.all([host.wait('game:start', () => true, startMark), second.wait('game:start', () => true, secondMark)]);
      gameId = `game_${code}`;
      const initial = (await host.wait('game:state', () => true, startMark)).state;
      assert.equal(initial.turnPhase, 'ROLL_PHASE');
      assert.equal(initial.players.length, 2);
      assertPublicState(initial);
      const rollId = randomUUID();
      const rollMark = host.mark();
      host.send('game:roll', { gameId }, { actionId: rollId });
      moving = (await host.wait('game:state', (data) => data.state.turnPhase === 'MOVING', rollMark)).state;
      assert.equal(moving.diceRollId, initial.diceRollId + 1);
      assert.ok(moving.phaseDeadline > Date.now());
      assertPublicState(moving);
      host.send('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
      // Local forced eviction may drain pending work for about 30 seconds. Only
      // this fixture extends the deadline; normal gameplay still uses 12 seconds.
      await roomTest(code, 'patch', { gameId, patch: { phaseDeadline: Date.now() + 100_000, phaseDeadlineFor: 'MOVING' } });
      const before = await host.state(gameId); // A command barrier after the first acknowledgement.
      assert.equal(before.turnPhase, 'MOVING', 'The second human must also finish presenting movement');
      const duplicateMark = host.mark();
      host.send('game:roll', { gameId }, { actionId: rollId });
      const afterDuplicate = await host.state(gameId);
      assert.deepEqual(afterDuplicate.diceValues, moving.diceValues);
      assert.equal(afterDuplicate.diceRollId, moving.diceRollId);
      assert.equal(host.frames.slice(duplicateMark).some((frame) => frame.event === 'game:error'), false);
      await fixture.runtime.unsafeEvictDurableObject('monomath-test', 'TestGameRoom', { name: `room:${code}`, webSockets: 'hibernate' });
      const restored = await host.state(gameId);
      assert.equal(restored.turnPhase, 'MOVING');
      assert.equal(restored.phaseDeadline, before.phaseDeadline, 'Wake must retain the absolute movement deadline');
      assert.equal(restored.diceRollId, before.diceRollId);
      assert.deepEqual(restored.diceValues, before.diceValues);
      assert.equal(restored.gameStartTime, before.gameStartTime);
      assert.deepEqual(restored.players.map((player) => player.position), before.players.map((player) => player.position));
      const completionMark = host.mark();
      second.send('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
      const resolved = (await host.wait('game:state', (data) => data.state.turnPhase !== 'MOVING', completionMark)).state;
      assert.equal(resolved.diceRollId, moving.diceRollId);
      assertPublicState(resolved);
      assertNoAnswer(resolved);
      const heartbeatMark = host.mark();
      host.ws.send('ping');
      await host.wait('__pong', () => true, heartbeatMark);
    });

    await t.test('another room cannot mutate or receive this room game state', async () => {
      const outsideIdentity = await guest('Other Host');
      const outside = await connect(outsideIdentity);
      const createMark = outside.mark();
      outside.send('room:create');
      const other = await outside.wait('room:created', () => true, createMark);
      assert.notEqual(other.code, code);
      const baseline = await host.state(gameId);
      const outsiderMark = outside.mark();
      outside.send('game:roll', { gameId });
      // A nonexistent room-local game is intentionally ignored. Resume supplies
      // a barrier proving that the foreign action was processed first.
      outside.send('room:resume', { code: other.code });
      await outside.wait('room:update', (room) => room.code === other.code, outsiderMark);
      const unchanged = await host.state(gameId);
      assert.equal(unchanged.diceRollId, baseline.diceRollId);
      assert.deepEqual(unchanged.diceValues, baseline.diceValues);
      assert.equal(unchanged.currentPlayerIndex, baseline.currentPlayerIndex);
      assert.equal(outside.frames.slice(outsiderMark).some((frame) => frame.event === 'game:state' && frame.data.state.id === gameId), false);
    });

    await t.test('private question evidence survives a database outage, hibernation and repeated delivery', async () => {
      // Give the real engine a known unowned property; it still selects the
      // question, grades the answer, updates BKT and creates the durable event.
      await roomTest(code, 'patch', { gameId, activePosition: 1, patch: {
        turnPhase: 'BUY_DECISION', currentPlayerIndex: 0, currentChallenge: null, duelState: null,
        phaseDeadline: null, phaseDeadlineFor: null,
        pendingTileEvent: { type: 'PROPERTY', tileIndex: 1, tileName: 'Tambah Alley', propertyPrice: 80, propertyOwner: null },
      } });
      const privateMark = host.mark();
      const spectatorMark = second.mark();
      host.send('game:smart-buy', { gameId });
      const { challenge } = await host.wait('game:challenge', () => true, privateMark);
      await second.wait('game:challenge-started', () => true, spectatorMark);
      assertNoAnswer(challenge);
      assert.ok(Array.isArray(challenge.options));
      assert.equal(second.frames.slice(spectatorMark).some((frame) => frame.event === 'game:challenge'), false);
      const serverQuestion = (await roomTest(code, 'snapshot')).games[0].currentChallenge;
      const selectedIndex = serverQuestion.correctIndex;
      assert.ok(selectedIndex >= 0, 'The isolated fixture must submit a genuinely correct answer');
      fixture.setDatabaseUnavailable(true);
      const answerId = randomUUID();
      const answerMark = host.mark();
      const publicAnswerMark = second.mark();
      host.send('game:smart-buy-answer', { gameId, selectedIndex }, { actionId: answerId });
      const answer = await host.wait('game:answer-result', (data) => data.challengeId === challenge.id, answerMark);
      const publicAnswer = await second.wait('game:answer-result', (data) => data.challengeId === challenge.id, publicAnswerMark);
      assert.equal(answer.result.isCorrect, true);
      assertNoAnswer(publicAnswer);
      const queued = await roomTest(code, 'snapshot');
      assert.equal(queued.outbox.length, 1);
      const event = queued.outbox[0];
      assert.equal(event.kind, 'attempt');
      assert.equal(event.value.record.challenge.id, challenge.id);
      assert.equal(event.value.record.player.playerId, hostIdentity.player.id);
      assert.equal((await fixture.postgres.query('SELECT COUNT(*)::int AS count FROM question_attempts')).rows[0].count, 0);
      await roomTest(code, 'patch', { gameId, patch: { phaseDeadline: Date.now() + 100_000, phaseDeadlineFor: 'BUY_DECISION' } });
      const deferred = await roomTest(code, 'flush', {});
      assert.equal(deferred.outbox[0].value.id, event.value.id, 'A failed SQL write must retain the original event identity');
      assert.ok(deferred.retryDelay > 1_000, 'A database failure must back off its retry');
      // Avoid local automatic-alarm/forced-eviction control requests racing each
      // other; the real failed write above already established retry behavior.
      await roomTest(code, 'patch', { gameId, patch: {}, deferRetriesFor: 100_000 });
      await fixture.runtime.unsafeEvictDurableObject('monomath-test', 'TestGameRoom', { name: `room:${code}`, webSockets: 'hibernate' });
      await host.state(gameId);
      const recovered = await roomTest(code, 'snapshot');
      assert.equal(recovered.outbox[0].value.id, event.value.id);
      assert.equal(recovered.outbox[0].value.answeredAt, event.value.answeredAt);
      fixture.setDatabaseUnavailable(false);
      // Resume the actual persisted alarm, rather than calling the success path
      // directly: restored research evidence must synchronize automatically.
      await roomTest(code, 'patch', { gameId, patch: {}, deferRetriesFor: 100 });
      const retryDeadline = Date.now() + 5_000;
      let row;
      while (Date.now() < retryDeadline) {
        row = (await fixture.postgres.query('SELECT * FROM question_attempts WHERE id = $1', [event.value.id])).rows[0];
        if (row) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await host.state(gameId);
      assert.equal((await roomTest(code, 'snapshot')).outbox.length, 0);
      assert.ok(row);
      assert.equal(row.playerId, hostIdentity.player.id);
      assert.equal(row.gameId, event.value.record.dbGameId);
      assert.equal(row.isCorrect, true);
      assert.equal(row.correctAnswer, serverQuestion.options[selectedIndex]);
      assert.equal(row.selectedAnswer, serverQuestion.options[selectedIndex]);
      assert.ok(Math.abs(row.pMasteryBefore - event.value.record.previousMastery) < 1e-9);
      assert.ok(Math.abs(row.pMasteryAfter - event.value.record.newMastery) < 1e-9);
      assert.equal(row.opportunityIndex, 1);
      // Emulate an acknowledged SQL commit whose local outbox retirement was
      // lost: replaying that same durable event must not learn or log twice.
      await roomTest(code, 'requeue', event);
      await roomTest(code, 'flush', {});
      assert.equal((await fixture.postgres.query('SELECT COUNT(*)::int AS count FROM question_attempts WHERE id = $1', [event.value.id])).rows[0].count, 1);
      const mastery = (await fixture.postgres.query('SELECT attempts, correct, "pMastery" FROM mastery_states WHERE "playerId" = $1 AND "skillId" = $2', [hostIdentity.player.id, `skill-${serverQuestion.skillName}`])).rows[0];
      assert.equal(mastery.attempts, 1);
      assert.equal(mastery.correct, 1);
      assert.ok(Math.abs(mastery.pMastery - event.value.record.newMastery) < 1e-9);
      const duplicateMark = host.mark();
      host.send('game:smart-buy-answer', { gameId, selectedIndex }, { actionId: answerId });
      await host.state(gameId);
      assert.equal(host.frames.slice(duplicateMark).some((frame) => frame.event === 'game:answer-result'), false);
      assert.equal((await roomTest(code, 'snapshot')).outbox.length, 0);
    });
    fixture.setDatabaseUnavailable(false);

    await t.test('HTTP-created UUID games route from the gateway to their durable room', async () => {
      const first = await guest('API First');
      const other = await guest('API Second');
      const players = [first, other].map((identity, order) => ({
        id: identity.player.id, playerId: identity.player.id, name: identity.player.displayName,
        color: order ? '#ef4444' : '#6366f1', tokenType: order ? 'top_hat' : 'race_car', order, isBot: false,
      }));
      const created = await api('/api/games', { token: first.token, method: 'POST', body: { players } });
      assert.equal(created.status, 201);
      assert.match(created.data.gameId, /^game_[0-9a-f-]{36}$/);
      assertPublicState(created.data.state);
      const apiClient = await connect(first);
      const mark = apiClient.mark();
      const restored = await apiClient.state(created.data.gameId);
      assert.equal(restored.id, created.data.gameId);
      assert.ok(apiClient.frames.slice(mark).some((frame) => frame.redirect));
      assert.equal(apiClient.endpoint.searchParams.get('room'), created.data.gameId.slice(5));
      assert.equal(restored.turnPhase, 'ROLL_PHASE');
      assertPublicState(restored);
      assert.equal((await api(`/api/games/${created.data.gameId}`, { token: first.token })).status, 200);
      assert.equal((await api(`/api/games/${created.data.gameId}`, { token: hostIdentity.token })).status, 403);
    });

    await t.test('invalid JWT explicitly reports connect_error and closes with 4401', async () => {
      const invalid = new GameClient(fixture.url, 'synthetic.invalid.token');
      clients.add(invalid);
      const error = await invalid.wait('connect_error');
      assert.equal(error.message, 'Authentication required');
      assert.equal((await invalid.wait('__close')).code, 4401);
      assert.equal(invalid.frames.some((frame) => frame.event === 'connect'), false);
    });

    assert.equal(fixture.failures.length, 0, 'Valid requests must not cause isolated SQL failures');
  } finally {
    await Promise.allSettled([...clients].map((client) => client.close()));
    await fixture.close();
  }
});
