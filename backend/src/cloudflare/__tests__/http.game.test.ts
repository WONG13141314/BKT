import { GameRoom, type RoomSnapshot } from '../room';
import { CloudflarePersistence } from '../database';
import * as auth from '../auth';
import type { WorkerEnv } from '../types';
import type { GameState } from '../../features/game/game.types';
import { makeGameState, makePrivateChallenge } from '../../test/game.fixtures';

/** Real room HTTP handlers with isolated storage and no database connections. */
async function harness(game?: GameState) {
  const values = new Map<string, unknown>();
  if (game) {
    values.set('room', {
      version: 1, code: 'TEST', rooms: { rooms: [], botCounter: 0 }, games: [game],
      gameHandlers: { botActions: [], botDuels: [], cleanup: [], movements: [] },
      lobbyHandlers: { pendingRemovals: [] }, timers: [], outbox: [], receipts: [],
      retryAt: null, retryDelay: 1_000,
    } satisfies RoomSnapshot);
  }
  const initialization: Promise<unknown>[] = [];
  const state = {
    storage: {
      async get(key: string) { return structuredClone(values.get(key)); },
      async transaction(operation: (transaction: DurableObjectTransaction) => Promise<unknown>) {
        const draft = structuredClone(values);
        const result = await operation({
          async put(key: string, value: unknown) { draft.set(key, structuredClone(value)); },
          async delete(keys: string[]) { for (const key of keys) draft.delete(key); },
          async setAlarm(_time: number) {}, async deleteAlarm() {},
        } as unknown as DurableObjectTransaction);
        values.clear();
        for (const [key, value] of draft) values.set(key, value);
        return result;
      },
    },
    blockConcurrencyWhile(operation: () => Promise<unknown>) {
      const ready = operation(); initialization.push(ready); return ready;
    },
    getWebSockets: () => [], setWebSocketAutoResponse: jest.fn(),
  } as unknown as DurableObjectState;
  const room = new GameRoom(state, {
    DATABASE_URL: 'postgresql://synthetic:synthetic@ep-synthetic.neon.tech/synthetic',
    JWT_SECRET: 'synthetic-secret-for-isolated-http-game-tests',
  } as WorkerEnv);
  await Promise.all(initialization);
  return { room, values };
}

function signedInAs(id: string) {
  return jest.spyOn(auth, 'authenticateToken').mockResolvedValue({
    id, displayName: 'Aina', avatar: 'star', role: 'PLAYER', isClaimed: false, username: null,
  });
}

function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`https://room${path}`, {
    method, headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('Cloudflare game HTTP access and public data', () => {
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

  it('returns public state without private questions or learner estimates to an authenticated seat', async () => {
    const state = makeGameState({ currentChallenge: makePrivateChallenge({ correctIndex: 2 }) });
    state.players[0].masteryStates = { Addition: 0.91 };
    signedInAs('db-player-1');
    const { room } = await harness(state);
    const response = await room.fetch(request('/api/games/game_TEST'));

    expect(response.status).toBe(200);
    const payload = await response.json() as { state: GameState };
    expect(payload.state).not.toHaveProperty('currentChallenge');
    expect(payload.state.players[0]).not.toHaveProperty('masteryStates');
    expect(JSON.stringify(payload)).not.toContain('correctIndex');
  });

  it.each(['/api/games/game_TEST', '/api/games/game_TEST/scores'])(
    'rejects an authenticated outsider from %s', async (path) => {
      signedInAs('db-outsider');
      const { room } = await harness(makeGameState());
      const response = await room.fetch(request(path));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'You are not a player in this game' });
    },
  );

  it('does not authorize an account that matches only the untrusted seat id', async () => {
    const state = makeGameState();
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    signedInAs('alice');
    const { room } = await harness(state);
    expect((await room.fetch(request('/api/games/game_TEST'))).status).toBe(403);
  });

  it('does not create a game when the account matches only a submitted seat id', async () => {
    signedInAs('alice');
    const loadPriors = jest.spyOn(CloudflarePersistence.prototype, 'loadPriors');
    const { room, values } = await harness();
    const response = await room.fetch(request('/api/games?room=TEST', 'POST', {
      players: [{ id: 'alice', playerId: 'bob' }, { id: 'seat-2', playerId: 'carol' }],
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'You must be a player in the new game' });
    expect(loadPriors).not.toHaveBeenCalled();
    expect((values.get('room') as RoomSnapshot).games).toEqual([]);
  });

  it('creates and persists a public game when an authenticated database identity owns a seat', async () => {
    signedInAs('db-player-1');
    const loadPriors = jest.spyOn(CloudflarePersistence.prototype, 'loadPriors').mockResolvedValue(new Map());
    const { room, values } = await harness();
    const response = await room.fetch(request('/api/games?room=TEST', 'POST', {
      players: [
        { id: 'seat-1', playerId: 'db-player-1', name: 'Aina', color: '#6366f1', order: 0 },
        { id: 'seat-2', playerId: 'db-player-2', name: 'Ben', color: '#f59e0b', order: 1 },
      ],
    }));
    expect(response.status).toBe(201);
    expect(loadPriors).toHaveBeenCalledWith(['db-player-1', 'db-player-2']);
    const payload = await response.json() as { gameId: string; state: GameState };
    expect(payload.gameId).toBe('game_TEST');
    expect(payload.state.players[0]).not.toHaveProperty('masteryStates');
    expect((values.get('room') as RoomSnapshot).games[0].id).toBe(payload.gameId);
  });

  it('returns the finished public scoreboard to an authenticated seat', async () => {
    signedInAs('db-player-1');
    const { room } = await harness(makeGameState({ phase: 'FINISHED' }));
    const response = await room.fetch(request('/api/games/game_TEST/scores'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scores: expect.arrayContaining([
      expect.objectContaining({ playerId: 'seat-1', rank: expect.any(Number) }),
    ]) });
  });

  it('rejects unauthenticated requests before reading game state', async () => {
    jest.spyOn(auth, 'authenticateToken').mockRejectedValue(new auth.ApiError('Authentication required', 401));
    const { room } = await harness(makeGameState());
    const response = await room.fetch(request('/api/games/game_TEST'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'Authentication required' });
  });

  it('returns a controlled missing-game response to an authenticated profile', async () => {
    signedInAs('db-player-1');
    const { room } = await harness();
    const response = await room.fetch(request('/api/games/game_ABSENT'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Game not found' });
  });
});
