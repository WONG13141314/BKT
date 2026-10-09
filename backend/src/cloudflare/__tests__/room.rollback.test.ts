import { GameRoom } from '../room';
import { PlayerDirectory } from '../player-directory';
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

function harness() {
  const socket = new SyntheticWebSocket();
  const values = new Map<string, unknown>();
  const initialization: Promise<unknown>[] = [];
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
    waitUntil: jest.fn(),
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
  } } as unknown as DurableObjectState, {});
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
    failNextCommit: () => { rejectNextCommit = true; },
  };
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
      method: 'POST', body: JSON.stringify({ code: 'DEF567' }),
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
});
