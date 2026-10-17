import { GameRoom } from '../room';
import { PlayerDirectory } from '../player-directory';
import { CloudflarePersistence } from '../database';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import type { GameState } from '../../features/game/game.types';
import type { RoomSnapshot } from '../room';
import type { ConnectionAttachment, WorkerEnv } from '../types';

interface StoredRoom extends Omit<RoomSnapshot, 'outbox'> { outboxIds: string[] }

class SyntheticWebSocket {
  readyState = 1;
  readonly sent: Array<{ event?: string; data?: unknown; ack?: string }> = [];
  private attachment: ConnectionAttachment = {
    id: 'synthetic-socket-1', rooms: ['room:ABC234'], expiresAt: Date.now() + 60_000,
    player: {
      id: 'synthetic-player-1', displayName: 'Aina', avatar: 'car',
      role: 'PLAYER', isClaimed: false, username: null,
    },
  };

  deserializeAttachment(): ConnectionAttachment { return structuredClone(this.attachment); }
  serializeAttachment(value: ConnectionAttachment): void { this.attachment = structuredClone(value); }
  send(message: string): void { this.sent.push(JSON.parse(message)); }
  close(): void { this.readyState = 3; }
}

function harness(saved?: RoomSnapshot) {
  const socket = new SyntheticWebSocket();
  const values = new Map<string, unknown>();
  if (saved) values.set('room', structuredClone(saved));
  const initialization: Promise<unknown>[] = [];
  const backgroundTasks: Promise<unknown>[] = [];
  let rejectNextCommit = false;
  const storage = {
    async get(key: string | string[]) {
      return Array.isArray(key)
        ? new Map(key.filter((item) => values.has(item)).map((item) => [item, structuredClone(values.get(item))]))
        : structuredClone(values.get(key));
    },
    async transaction(operation: (transaction: DurableObjectTransaction) => Promise<unknown>) {
      const draft = structuredClone(values);
      const transaction = {
        async get(key: string | string[]) {
          return Array.isArray(key)
            ? new Map(key.filter((item) => draft.has(item)).map((item) => [item, structuredClone(draft.get(item))]))
            : structuredClone(draft.get(key));
        },
        async put(key: string, value: unknown) { draft.set(key, structuredClone(value)); },
        async delete(keys: string[]) { for (const key of keys) draft.delete(key); },
        async setAlarm(_time: number) {},
        async deleteAlarm() {},
      } as unknown as DurableObjectTransaction;
      const result = await operation(transaction);
      if (rejectNextCommit) {
        rejectNextCommit = false;
        throw new Error('Synthetic durable-storage commit failure');
      }
      values.clear();
      for (const [key, value] of draft) values.set(key, value);
      return result;
    },
  };
  const state = {
    storage,
    blockConcurrencyWhile(operation: () => Promise<unknown>) {
      const ready = operation();
      initialization.push(ready);
      return ready;
    },
    getWebSockets: () => [socket],
    setWebSocketAutoResponse: jest.fn(),
    waitUntil: jest.fn((task: Promise<unknown>) => { backgroundTasks.push(task); }),
  } as unknown as DurableObjectState;
  let membership: { code: string | null; version: number } | undefined;
  const directory = new PlayerDirectory({ storage: {
    async get() { return structuredClone(membership); },
    async transaction(operation: (transaction: DurableObjectTransaction) => Promise<unknown>) {
      let draft = structuredClone(membership);
      const result = await operation({
        async get() { return structuredClone(draft); },
        async put(_key: string, value: typeof membership) { draft = structuredClone(value); },
      } as unknown as DurableObjectTransaction);
      membership = draft;
      return result;
    },
  } } as unknown as DurableObjectState, {
    ROOMS: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(JSON.stringify({ synchronized: true })) }),
    },
  } as unknown as WorkerEnv);
  const directoryFetch = jest.fn((input: string | Request, init?: RequestInit) =>
    directory.fetch(input instanceof Request ? input : new Request(input, init)));
  const room = new GameRoom(state, {
    DATABASE_URL: 'postgresql://synthetic:synthetic@ep-synthetic.neon.tech/synthetic',
    JWT_SECRET: 'synthetic-secret-no-real-database-is-used',
    PLAYERS: {
      idFromName: () => 'synthetic-player-directory',
      get: () => ({ fetch: directoryFetch }),
    },
  } as unknown as WorkerEnv);
  return {
    room, socket, values, directory, directoryFetch,
    ready: () => Promise.all(initialization),
    background: () => Promise.all(backgroundTasks),
    failNextCommit: () => { rejectNextCommit = true; },
  };
}

function researchSnapshot(game?: GameState): RoomSnapshot {
  const state = makeGameState();
  return {
    version: 1, code: 'ABC234',
    rooms: { botCounter: 1, rooms: [{
      code: 'ABC234', hostId: 'synthetic-player-1', maxPlayers: 4,
      status: game ? 'playing' : 'waiting',
      players: [
        { id: 'synthetic-player-1', name: 'Aina', avatar: 'car', isReady: true, isBot: false },
        { id: 'synthetic-bot-1', name: 'Bot Ali', avatar: 'ship', isReady: true, isBot: true, botDifficulty: 'medium' },
      ],
    }] },
    games: game ? [game] : [],
    gameHandlers: { botActions: [], botDuels: [], cleanup: [], movements: [] },
    lobbyHandlers: { pendingRemovals: [] }, timers: [], receipts: [],
    retryAt: 0, retryDelay: 1_000,
    outbox: [{ kind: 'attempt', value: {
      id: 'synthetic-existing-attempt', answeredAt: new Date().toISOString(),
      record: {
        player: state.players[0], dbGameId: state.dbGameId,
        challenge: makePrivateChallenge(), selectedIndex: 1, timeMs: 4_000,
        previousMastery: 0.4, newMastery: 0.55, isCorrect: true,
      },
    } }],
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('room command recovery after a failed durable commit', () => {
  let originalAutoResponse: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalAutoResponse = Object.getOwnPropertyDescriptor(globalThis, 'WebSocketRequestResponsePair');
    Object.defineProperty(globalThis, 'WebSocketRequestResponsePair', {
      configurable: true, value: class { constructor(_request: string, _response: string) {} },
    });
  });

  afterAll(() => {
    if (originalAutoResponse) Object.defineProperty(globalThis, 'WebSocketRequestResponsePair', originalAutoResponse);
    else Reflect.deleteProperty(globalThis, 'WebSocketRequestResponsePair');
  });
  afterEach(() => jest.restoreAllMocks());

  it('dispatches the next queued command against the rebuilt lobby rather than the failed facade', async () => {
    const { room, socket, values, ready, failNextCommit } = harness();
    await ready();
    const reserved = await room.fetch(new Request('https://room/internal/reserve', {
      method: 'POST', body: JSON.stringify({ code: 'ABC234', player: socket.deserializeAttachment().player }),
    }));
    expect(reserved.status).toBe(201);
    socket.sent.length = 0;
    failNextCommit();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Both enter the queue before the first command's save fails. The real
      // lobby handlers toggle readiness; neither command touches Neon.
      const first = room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
        event: 'room:ready', actionId: 'synthetic-failed-ready',
      }));
      const second = room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
        event: 'room:ready', actionId: 'synthetic-successful-ready',
      }));
      await Promise.all([first, second]);
    } finally {
      log.mockRestore();
    }

    const stored = values.get('room') as StoredRoom;
    expect(stored.rooms.rooms[0].players[0].isReady).toBe(false);
    expect(stored.receipts.map((receipt) => receipt.key)).toEqual([
      'synthetic-player-1:synthetic-successful-ready',
    ]);
    const inspection = await (await room.fetch(new Request('https://room/internal/inspect'))).json() as {
      room: { players: Array<{ isReady: boolean }> };
    };
    expect(inspection.room.players[0].isReady).toBe(false);
    expect(socket.sent.filter((frame) => frame.event === 'game:error')).toHaveLength(1);
    const updates = socket.sent.filter((frame) => frame.event === 'room:update');
    expect(updates).toHaveLength(1); // No update from the rolled-back command escapes.
    expect(updates[0].data).toMatchObject({ players: [{ isReady: false }] });
  });

  it('keeps committed lobby state when a peer attachment fails after the storage commit', async () => {
    const { room, socket, values, ready } = harness();
    await ready();
    await room.fetch(new Request('https://room/internal/reserve', {
      method: 'POST', body: JSON.stringify({ code: 'ABC234', player: socket.deserializeAttachment().player }),
    }));
    socket.sent.length = 0;
    jest.spyOn(socket, 'serializeAttachment').mockImplementationOnce(() => {
      throw new Error('Synthetic unavailable WebSocket attachment');
    });
    const close = jest.spyOn(socket, 'close');
    await room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
      event: 'room:ready', actionId: 'synthetic-committed-ready',
    }));

    const stored = values.get('room') as StoredRoom;
    expect(stored.rooms.rooms[0].players[0].isReady).toBe(false);
    expect(stored.receipts.map((receipt) => receipt.key)).toEqual([
      'synthetic-player-1:synthetic-committed-ready',
    ]);
    const inspection = await (await room.fetch(new Request('https://room/internal/inspect'))).json() as {
      room: { players: Array<{ isReady: boolean }> };
    };
    expect(inspection.room.players[0].isReady).toBe(false);
    expect(close).toHaveBeenCalledWith(1011, 'Please reconnect');
    expect(socket.sent.some((frame) => frame.event === 'game:error')).toBe(false);
  });

  it('conditionally restores the previous directory pointer when a resumed room fails to commit', async () => {
    const { room, socket, values, directory, directoryFetch, ready, failNextCommit } = harness();
    await ready();
    await directory.fetch(new Request('https://directory/claim', {
      method: 'POST', body: JSON.stringify({ code: 'DEF567', playerId: 'synthetic-player-1' }),
    }));
    await room.fetch(new Request('https://room/internal/reserve', {
      method: 'POST', body: JSON.stringify({ code: 'ABC234', player: socket.deserializeAttachment().player }),
    }));
    socket.sent.length = 0;
    failNextCommit();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
        event: 'room:resume', data: { code: 'ABC234' }, actionId: 'synthetic-failed-resume',
      }));
    } finally {
      log.mockRestore();
    }

    expect(await (await directory.fetch(new Request('https://directory/current'))).json()).toEqual({
      code: 'DEF567', version: 3,
    });
    expect(directoryFetch.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/claim', '/restore',
    ]);
    const stored = values.get('room') as StoredRoom;
    expect(stored.receipts).toEqual([]);
    expect(stored.rooms.rooms[0].players).toEqual([expect.objectContaining({
      id: 'synthetic-player-1', isReady: true,
    })]);
    expect(socket.sent.filter((frame) => frame.event === 'room:update')).toHaveLength(0);
    expect(socket.sent.filter((frame) => frame.event === 'game:error')).toHaveLength(1);
  });

  it('grades an answer and durably queues its evidence while an earlier research write is pending', async () => {
    const game = makeGameState({
      id: 'game_ABC234', turnPhase: 'CARD_MATH_CHALLENGE',
      currentChallenge: makePrivateChallenge({ startedAt: Date.now() }),
    });
    game.players[0].playerId = 'synthetic-player-1';
    const gate = deferred();
    const started = deferred();
    const write = jest.spyOn(CloudflarePersistence.prototype, 'persistAttempt').mockImplementation(async (event) => {
      if (event.id === 'synthetic-existing-attempt') {
        started.resolve();
        await gate.promise;
      }
    });
    const { room, socket, values, ready, background } = harness(researchSnapshot(game));
    await ready();
    const alarm = room.alarm();
    await started.promise;
    let completed = false;
    const answer = room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
      event: 'game:card-answer', data: { gameId: game.id, selectedIndex: 1 }, actionId: 'synthetic-answer-during-sync',
    })).then(() => { completed = true; });
    try {
      // All fixture operations resolve in microtasks; a pending SQL promise must not hold this action.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(completed).toBe(true);
      expect(socket.sent.find((frame) => frame.event === 'game:answer-result')?.data).toMatchObject({
        result: { isCorrect: true, timedOut: false },
      });
      const stored = values.get('room') as StoredRoom;
      expect(stored.games[0].players[0].totalCorrect).toBe(1);
      expect(stored.outboxIds).toHaveLength(2);
      expect(stored.outboxIds[0]).toBe('synthetic-existing-attempt');
    } finally {
      gate.resolve();
      await Promise.all([alarm, answer, background()]);
    }
    expect(write).toHaveBeenCalledTimes(2);
    expect((values.get('room') as StoredRoom).outboxIds).toEqual([]);
  });

  it('commits a later gameplay deadline while the detached research request remains pending', async () => {
    const initialTime = Date.now();
    const game = makeGameState({
      id: 'game_ABC234', turnPhase: 'CARD_MATH_CHALLENGE',
      currentChallenge: makePrivateChallenge({ startedAt: initialTime, timeLimit: 20 }),
    });
    game.players[0].playerId = 'synthetic-player-1';
    const gate = deferred();
    const started = deferred();
    jest.spyOn(CloudflarePersistence.prototype, 'persistAttempt').mockImplementation(async (event) => {
      if (event.id === 'synthetic-existing-attempt') { started.resolve(); await gate.promise; }
    });
    const { room, socket, values, ready, background } = harness(researchSnapshot(game));
    await ready();
    let firstAlarmCompleted = false;
    const firstAlarm = room.alarm().then(() => { firstAlarmCompleted = true; });
    await started.promise;
    const now = jest.spyOn(Date, 'now').mockReturnValue(initialTime + 25_000);
    try {
      expect(firstAlarmCompleted).toBe(true);
      await room.alarm();
      expect(socket.sent.find((frame) => frame.event === 'game:answer-result')?.data).toMatchObject({
        result: { isCorrect: false, timedOut: true },
      });
      expect((values.get('room') as StoredRoom).games[0].currentChallenge).toBeNull();
      expect((values.get('room') as StoredRoom).outboxIds).toHaveLength(2);
    } finally {
      now.mockRestore();
      gate.resolve();
      await Promise.all([firstAlarm, background()]);
    }
  });

  it('retains a confirmed SQL event when retiring it fails to commit and retries the same identity', async () => {
    const saved = researchSnapshot();
    const gate = deferred();
    const started = deferred();
    const write = jest.spyOn(CloudflarePersistence.prototype, 'persistAttempt')
      .mockImplementationOnce(async () => { started.resolve(); await gate.promise; })
      .mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { room, values, ready, failNextCommit, background } = harness(saved);
    await ready();
    const alarm = room.alarm();
    await started.promise;
    failNextCommit();
    gate.resolve();
    await alarm;
    await background();
    const stored = values.get('room') as StoredRoom;
    expect(stored.outboxIds).toEqual(['synthetic-existing-attempt']);
    expect(values.get('outbox:synthetic-existing-attempt')).toEqual(saved.outbox[0]);
    expect(stored.retryDelay).toBe(2_000);
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    try { await room.alarm(); await background(); }
    finally { now.mockRestore(); }
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0]);
    expect((values.get('room') as StoredRoom).outboxIds).toEqual([]);
  });

  it('shares a pending SQL request with the required new-game prior barrier without deadlocking', async () => {
    const gate = deferred();
    const started = deferred();
    const write = jest.spyOn(CloudflarePersistence.prototype, 'persistAttempt').mockImplementation(async () => {
      started.resolve();
      await gate.promise;
    });
    const priors = jest.spyOn(CloudflarePersistence.prototype, 'loadPriors').mockResolvedValue(new Map([
      ['synthetic-player-1', { mastery: { Addition: 0.82 }, attempts: { Addition: 6 } }],
    ]));
    const { room, socket, values, ready, background } = harness(researchSnapshot());
    await ready();
    const alarm = room.alarm();
    await started.promise;
    const starting = room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
      event: 'room:start', actionId: 'synthetic-start-during-sync',
    }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(priors).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([alarm, starting, background()]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(priors).toHaveBeenCalledWith(['synthetic-player-1']);
    const stored = values.get('room') as StoredRoom;
    expect(stored.outboxIds).toEqual([]);
    // Turn order is shuffled at start, so find the learner by account.
    expect(stored.games[0].players.find((seat) => seat.playerId === 'synthetic-player-1')).toMatchObject({
      masteryStates: { Addition: 0.82 }, skillAttempts: { Addition: 6 },
    });
    expect(socket.sent.some((frame) => frame.event === 'game:start')).toBe(true);
  });

  it('synchronizes only committed evidence for the requested profile without waiting for the room action queue', async () => {
    const saved = researchSnapshot();
    const first = saved.outbox[0];
    if (first.kind !== 'attempt') throw new Error('Expected fixture attempt');
    const other = structuredClone(first);
    other.value.id = 'synthetic-other-player-attempt';
    other.value.record.player.playerId = 'synthetic-other-player';
    saved.outbox.push(other);
    const write = jest.spyOn(CloudflarePersistence.prototype, 'persistAttempt').mockResolvedValue(undefined);
    const gate = deferred<Map<string, { mastery: Record<string, number>; attempts: Record<string, number> }>>();
    const started = deferred();
    jest.spyOn(CloudflarePersistence.prototype, 'loadPriors').mockImplementation(async () => {
      started.resolve();
      return gate.promise;
    });
    const { room, socket, values, ready } = harness(saved);
    await ready();
    const starting = room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
      event: 'room:start', actionId: 'synthetic-held-prior-read',
    }));
    await started.promise;
    write.mockClear();
    let completed = false;
    const synchronization = room.fetch(new Request('https://room/internal/synchronize-player', {
      method: 'POST', body: JSON.stringify({ playerId: first.value.record.player.playerId }),
    })).then((response) => { completed = true; return response; });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(completed).toBe(true);
      expect((await synchronization).status).toBe(200);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(first.value);
      // The action has not committed its in-memory retirement. The durable source still owns both events.
      expect(values.get('room')).toEqual(saved);
    } finally {
      gate.resolve(new Map());
      await Promise.all([starting, synchronization]);
    }
  });
});
