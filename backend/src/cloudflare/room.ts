import type { PublicPlayer } from '../features/auth/auth.types';
import { createGameService, type GameService } from '../features/game/game.runtime';
import type { GameState } from '../features/game/game.types';
import { toPublicGameState } from '../features/game/game.public';
import { RoomManager, type RoomManagerSnapshot } from '../sockets/lobby.manager';
import { SocketPresence } from '../sockets/presence.manager';
import { createGameHandlersRuntime, type GameHandlersRuntime, type GameHandlersSnapshot } from '../sockets/game.handlers.runtime';
import { createLobbyHandlersRuntime, type LobbyHandlersRuntime, type LobbyHandlersSnapshot } from '../sockets/lobby.handlers.runtime';
import { ApiError, authenticateToken, readBearerToken } from './auth';
import { CloudflarePersistence, type DurableAttemptEvent, type DurableGameResultEvent } from './database';
import { jsonResponse } from './http';
import { AlarmScheduler, type ScheduledDeadline } from './scheduler';
import { HibernatingSocket, RoomSocketServer } from './transport';
import type { ClientFrame, ConnectionAttachment, WorkerEnv } from './types';

type OutboxEvent = { kind: 'attempt'; value: DurableAttemptEvent } | { kind: 'result'; value: DurableGameResultEvent };
interface Receipt { key: string; ack?: unknown }
type StoredRoom = Omit<RoomSnapshot, 'outbox'> & { outboxIds: string[] };
export interface RoomSnapshot {
  version: 1;
  code?: string;
  rooms: RoomManagerSnapshot;
  games: GameState[];
  gameHandlers: GameHandlersSnapshot;
  lobbyHandlers: LobbyHandlersSnapshot;
  timers: ScheduledDeadline[];
  outbox: OutboxEvent[];
  receipts: Receipt[];
  retryAt: number | null;
  retryDelay: number;
}

const ROOM_CODE = /^[A-Z2-9]{6}$/;
const FRAME_LIMIT = 64 * 1024;
const OUTBOX_LIMIT = 2_000;

/** One room owns its complete rules, storage, sockets, deadlines and research outbox. */
export class GameRoom {
  private code?: string;
  private service!: GameService;
  private rooms!: RoomManager;
  private gameHandlers!: GameHandlersRuntime;
  private lobbyHandlers!: LobbyHandlersRuntime;
  private presence!: SocketPresence;
  private io!: RoomSocketServer;
  private scheduler!: AlarmScheduler;
  private outbox: OutboxEvent[] = [];
  private receipts: Receipt[] = [];
  private retryAt: number | null = null;
  private retryDelay = 1_000;
  private pending: Array<{ socket: HibernatingSocket; frame: unknown }> = [];
  private serial: Promise<unknown> = Promise.resolve();
  private readonly database: CloudflarePersistence;
  private storedOutboxIds = new Set<string>();

  constructor(private readonly ctx: DurableObjectState, private readonly env: WorkerEnv) {
    this.database = new CloudflarePersistence(env.DATABASE_URL);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomSnapshot | StoredRoom>('room');
      let saved: RoomSnapshot | undefined;
      if (stored && 'outboxIds' in stored) {
        const outbox: OutboxEvent[] = [];
        for (let n = 0; n < stored.outboxIds.length; n += 128) {
          const ids = stored.outboxIds.slice(n, n + 128);
          const values = await ctx.storage.get<OutboxEvent>(ids.map((id) => `outbox:${id}`));
          for (const id of ids) {
            const event = values.get(`outbox:${id}`);
            if (!event) throw new Error('Incomplete durable research outbox');
            outbox.push(event);
          }
        }
        this.storedOutboxIds = new Set(stored.outboxIds);
        saved = { ...stored, outbox };
      } else saved = stored;
      this.initialize(saved);
    });
  }

  private initialize(saved?: RoomSnapshot): void {
    this.code = saved ? saved.code : this.code;
    this.outbox = saved?.outbox ?? [];
    this.receipts = saved?.receipts ?? [];
    this.retryAt = saved?.retryAt ?? null;
    this.retryDelay = saved?.retryDelay ?? 1_000;
    this.scheduler = new AlarmScheduler(saved?.timers);
    this.rooms = new RoomManager({ fixedCode: this.code });
    if (saved) this.rooms.restore(saved.rooms);
    this.service = createGameService({ persistence: {
      newGameId: () => crypto.randomUUID(),
      loadMasteryPriorsAfterWrites: async (ids) => {
        await this.flushOutbox(true);
        return this.database.loadPriors(ids);
      },
      recordAttempt: (record) => {
        if (record.player.isBot) return;
        if (this.outbox.length >= OUTBOX_LIMIT) throw new Error('Research synchronization backlog is full');
        this.outbox.push({ kind: 'attempt', value: {
          id: crypto.randomUUID(), record: structuredClone(record), answeredAt: new Date().toISOString(),
        } });
        this.retryAt ??= Date.now() + 1_000;
      },
    } });
    if (saved) this.service.restore(saved.games);
    this.presence = new SocketPresence();
    this.io = new RoomSocketServer();
    this.gameHandlers = createGameHandlersRuntime({
      gameService: this.service, roomManager: this.rooms, presence: this.presence, scheduler: this.scheduler,
      recordGameResult: (state, scores) => {
        if (this.outbox.some((event) => event.kind === 'result' && event.value.state.dbGameId === state.dbGameId)) return;
        this.outbox.push({ kind: 'result', value: {
          state: structuredClone(state), scores: structuredClone(scores), endedAt: new Date().toISOString(),
        } });
        this.retryAt ??= Date.now() + 1_000;
      },
    });
    this.lobbyHandlers = createLobbyHandlersRuntime({
      gameService: this.service, roomManager: this.rooms, presence: this.presence,
      scheduler: this.scheduler, publishGameStart: this.gameHandlers.publishStart,
    });
    if (saved) {
      this.gameHandlers.restore(saved.gameHandlers);
      this.lobbyHandlers.restore(saved.lobbyHandlers);
    }
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === 1) this.attach(ws);
    this.scheduler.rehydrate(() => {
      this.gameHandlers.resume(this.io.asServer());
      this.lobbyHandlers.resume(this.io.asServer());
    });
  }

  private attach(ws: WebSocket): HibernatingSocket {
    const attachment = ws.deserializeAttachment() as ConnectionAttachment;
    const existing = this.io.sockets.sockets.get(attachment.id);
    if (existing) return existing;
    const socket = new HibernatingSocket(ws, attachment,
      (recipient, frame) => this.pending.push({ socket: recipient, frame: structuredClone(frame) }),
      () => this.io.sync());
    this.io.add(socket);
    this.presence.connect(attachment.player.id, attachment.id);
    this.lobbyHandlers.register(this.io.asServer(), socket.asSocket(), this.presence);
    this.gameHandlers.register(this.io.asServer(), socket.asSocket(), this.presence);
    return socket;
  }

  private snapshot(): RoomSnapshot {
    return structuredClone({ version: 1, code: this.code, rooms: this.rooms.snapshot(), games: this.service.snapshot(),
      gameHandlers: this.gameHandlers.snapshot(), lobbyHandlers: this.lobbyHandlers.snapshot(),
      timers: this.scheduler.snapshot(), outbox: this.outbox, receipts: this.receipts,
      retryAt: this.retryAt, retryDelay: this.retryDelay });
  }

  private async save(): Promise<void> {
    const next = Math.min(this.scheduler.next() ?? Infinity, this.outbox.length ? this.retryAt ?? Date.now() + 1_000 : Infinity);
    const { outbox, ...state } = this.snapshot();
    const eventId = (event: OutboxEvent) => event.kind === 'attempt' ? event.value.id : `result:${event.value.state.dbGameId}`;
    const ids = outbox.map(eventId);
    await this.ctx.storage.transaction(async (storage) => {
      // Individual outbox records keep a backlog below the per-value storage limit.
      for (const event of outbox) {
        const id = eventId(event);
        if (!this.storedOutboxIds.has(id)) await storage.put(`outbox:${id}`, event);
      }
      const removed = [...this.storedOutboxIds].filter((id) => !ids.includes(id));
      for (let n = 0; n < removed.length; n += 128) await storage.delete(removed.slice(n, n + 128).map((id) => `outbox:${id}`));
      await storage.put('room', { ...state, outboxIds: ids } satisfies StoredRoom);
      if (Number.isFinite(next)) await storage.setAlarm(Math.max(Date.now() + 1, next));
      else await storage.deleteAlarm();
    });
    this.storedOutboxIds = new Set(ids);
    for (const socket of this.io.sockets.sockets.values()) {
      try { socket.saveAttachment(); }
      catch {
        // Storage has committed. Reconnect this peer rather than roll back a
        // published game because one connection's attachment became unavailable.
        if (socket.ws.readyState === 1) socket.ws.close(1011, 'Please reconnect');
      }
    }
    const messages = this.pending.splice(0);
    for (const { socket, frame } of messages) {
      if (socket.ws.readyState !== 1) continue;
      try { socket.ws.send(JSON.stringify(frame)); } catch { /* The durable snapshot remains authoritative. */ }
    }
  }

  private transact<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.serial.then(async () => {
      const before = this.snapshot();
      try {
        const result = await task();
        await this.save();
        return result;
      } catch (error) {
        this.pending = [];
        this.initialize(before);
        throw error;
      }
    });
    this.serial = run.catch(() => {});
    return run;
  }

  /** The head stays durable until Neon confirms its idempotent transaction. */
  private async flushOutbox(required = false): Promise<void> {
    const limit = required ? OUTBOX_LIMIT : 10;
    try {
      for (let n = 0; this.outbox.length && n < limit; n++) {
        const event = this.outbox[0];
        if (event.kind === 'attempt') await this.database.persistAttempt(event.value);
        else await this.database.persistGameResult(event.value);
        this.outbox.shift();
      }
      this.retryDelay = 1_000;
      this.retryAt = this.outbox.length ? Date.now() + 1_000 : null;
    } catch (error) {
      this.retryAt = Date.now() + this.retryDelay;
      this.retryDelay = Math.min(60_000, this.retryDelay * 2);
      console.error('[room] Research synchronization deferred:', error instanceof Error ? error.name : 'Unknown error');
      if (required) throw error;
    }
  }

  async alarm(): Promise<void> {
    await this.transact(async () => {
      this.scheduler.runDue();
      if (this.outbox.length && (this.retryAt ?? 0) <= Date.now()) await this.flushOutbox();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/remove-player' && request.method === 'POST') {
      const { playerId, version } = await request.json() as { playerId: string; version: number };
      return this.transact(async () => {
        const directory = this.env.PLAYERS.get(this.env.PLAYERS.idFromName(playerId));
        const current = await (await directory.fetch('https://player/current')).json() as { code: string | null; version: number };
        // A later claim may have returned this profile to the old room already.
        if (current.code === this.code || current.version < version) return jsonResponse({ removed: false });
        const code = this.rooms.removePlayer(playerId);
        if (code) {
          for (const socket of this.io.sockets.sockets.values()) {
            if (socket.data.player.id !== playerId) continue;
            socket.leave(`room:${code}`);
            socket.emit('room:removed', { code, message: 'Your profile joined another room.' });
          }
          const room = this.rooms.getRoom(code);
          this.io.to(`room:${code}`).emit(room ? 'room:update' : 'room:deleted', room ? this.rooms.serializeRoom(room) : { code });
        }
        return jsonResponse({ removed: !!code });
      });
    }
    if (url.pathname === '/internal/inspect') {
      const room = this.code ? this.rooms.getRoom(this.code) : undefined;
      return jsonResponse({ room: room ? this.rooms.serializeRoom(room) : null });
    }
    if (url.pathname === '/internal/reserve' && request.method === 'POST') {
      return this.transact(async () => {
        if (this.code || this.rooms.snapshot().rooms.length) return jsonResponse({ error: 'Room exists' }, 409);
        const { code, player } = await request.json() as { code: string; player: PublicPlayer };
        if (!ROOM_CODE.test(code)) return jsonResponse({ error: 'Invalid room' }, 400);
        this.code = code;
        this.initialize();
        const room = this.rooms.createRoom(player.id, player.displayName, player.avatar);
        return jsonResponse({ room: this.rooms.serializeRoom(room) }, 201);
      });
    }
    try {
      const token = url.pathname === '/ws' ? url.searchParams.get('token') : readBearerToken(request.headers.get('authorization'));
      const player = await authenticateToken(token, this.env);
      if (url.pathname.startsWith('/api/games')) return await this.gameHttp(request, player);
      if (url.pathname !== '/ws' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return jsonResponse({ message: 'Not found' }, 404);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      server.serializeAttachment({ id: crypto.randomUUID(), player, rooms: [],
        expiresAt: payload.exp ? payload.exp * 1_000 : Date.now() + 90 * 86_400_000 } satisfies ConnectionAttachment);
      this.ctx.acceptWebSocket(server);
      await this.transact(() => {
        const socket = this.attach(server);
        this.pending.push({ socket, frame: { event: 'connect', data: { id: socket.id } } });
      });
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 && url.pathname === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const [client, server] = Object.values(new WebSocketPair());
          server.accept();
          server.send(JSON.stringify({ event: 'connect_error', data: { message: error.message } }));
          server.close(4401, 'Authentication required');
          return new Response(null, { status: 101, webSocket: client });
        }
        return jsonResponse({ message: error.message }, error.status);
      }
      console.error('[room] Request failed:', error instanceof Error ? error.name : 'Unknown error');
      return jsonResponse({ message: 'Unable to open game room' }, 503);
    }
  }

  private async gameHttp(request: Request, player: PublicPlayer): Promise<Response> {
    return this.transact(async () => {
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/api/games') {
        const { players } = await request.json() as { players: Parameters<GameService['createGame']>[1] };
        if (!Array.isArray(players) || players.length < 2 || players.length > 4) return jsonResponse({ error: '2 to 4 players required' }, 400);
        if (!players.some((seat) => seat.playerId === player.id)) return jsonResponse({ error: 'You must be a player in the new game' }, 403);
        this.code = url.searchParams.get('room') ?? crypto.randomUUID();
        const state = await this.service.createGame(`game_${this.code}`, players);
        this.gameHandlers.publishStart(this.io.asServer(), state);
        return jsonResponse({ gameId: state.id, state: toPublicGameState(state) }, 201);
      }
      const match = url.pathname.match(/^\/api\/games\/([^/]+)(\/scores)?$/);
      if (!match || request.method !== 'GET') return jsonResponse({ message: 'Not found' }, 404);
      const state = this.service.getGameSync(decodeURIComponent(match[1]));
      if (!state) return jsonResponse({ error: 'Game not found' }, 404);
      if (!state.players.some((seat) => seat.playerId === player.id)) return jsonResponse({ error: 'You are not a player in this game' }, 403);
      return jsonResponse(match[2] ? { scores: this.service.getScores(state.id) } : { state: toPublicGameState(state) });
    });
  }

  private async route(socket: HibernatingSocket, frame: ClientFrame): Promise<boolean> {
    const data = frame.data as { code?: unknown; gameId?: unknown; reservation?: unknown } | undefined;
    let target: string | undefined;
    if (frame.event === 'room:create') {
      const room = this.code ? this.rooms.getRoom(this.code) : undefined;
      if (room?.status === 'waiting' && room.hostId === socket.data.player.id && data?.reservation === this.code) {
        socket.join(`room:${room.code}`);
        socket.emit('room:created', { code: room.code });
        socket.emit('room:update', this.rooms.serializeRoom(room));
        return true;
      }
      for (let tries = 0; tries < 5; tries++) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        target = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => alphabet[n % alphabet.length]).join('');
        const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(`room:${target}`));
        const response = await stub.fetch('https://room/internal/reserve', {
          method: 'POST', body: JSON.stringify({ code: target, player: socket.data.player }),
        });
        if (response.status === 201) break;
        target = undefined;
      }
      if (!target) throw new Error('Unable to allocate room');
    } else if (['room:join', 'room:resume'].includes(frame.event)) {
      target = typeof data?.code === 'string' ? data.code.toUpperCase() : undefined;
      if (!target || !ROOM_CODE.test(target)) {
        socket.emit('room:error', { message: 'Enter a valid six-character room code.' });
        return true;
      }
      if (target === this.code) return false;
      const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(`room:${target}`));
      const { room } = await (await stub.fetch('https://room/internal/inspect')).json() as {
        room: ReturnType<RoomManager['serializeRoom']> | null;
      };
      const member = room?.players.some((seat) => seat.id === socket.data.player.id);
      if (!room || (frame.event === 'room:resume' && !member)) {
        socket.emit(frame.event === 'room:resume' ? 'room:removed' : 'room:error', {
          code: target, message: frame.event === 'room:resume' ? 'Your place in this room is no longer available.' : 'Room not found. Check the code and try again.',
        });
        return true;
      }
      if (frame.event === 'room:join' && (room.status !== 'waiting' || (room.players.length >= room.maxPlayers && !member))) {
        socket.emit('room:error', { message: room.status !== 'waiting' ? 'Game already in progress.' : 'Room is full (max 4 players).' });
        return true;
      }
    } else if (frame.event === 'game:request-state' && typeof data?.gameId === 'string') {
      const code = data.gameId.replace(/^game_/, '');
      if (code !== this.code && /^[\w-]{1,100}$/.test(code)) target = code;
      else return false;
    } else return false;
    await this.flushOutbox(true);
    await socket.dispatch('room:leave', {});
    this.pending.push({ socket, frame: { redirect: `/ws?room=${encodeURIComponent(target!)}`, resume: {
      event: frame.event, data: frame.event === 'room:create' ? { reservation: target } : frame.data,
    } } });
    return true;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let claimed: { code: string; previousCode: string | null; version: number; playerId: string } | undefined;
    const attachment = ws.deserializeAttachment() as ConnectionAttachment;
    if (attachment.expiresAt <= Date.now()) {
      ws.send(JSON.stringify({ event: 'connect_error', data: { message: 'Your session expired. Please sign in again.' } }));
      ws.close(4401, 'Session expired');
      return;
    }
    try {
      if (typeof message !== 'string' || message.length > FRAME_LIMIT) throw new Error('Invalid message');
      const frame = JSON.parse(message) as ClientFrame;
      if (typeof frame.event !== 'string' || frame.event.length > 80 || frame.event === 'disconnect') throw new Error('Invalid event');
      if (frame.id !== undefined && (typeof frame.id !== 'string' || frame.id.length > 128)) throw new Error('Invalid acknowledgement');
      if (frame.actionId !== undefined && (typeof frame.actionId !== 'string' || frame.actionId.length > 128)) throw new Error('Invalid action identity');
      let departed: { code: string; version: number; playerId: string } | undefined;
      await this.transact(async () => {
        // A preceding failed command may have rebuilt every runtime and facade.
        const socket = this.attach(ws);
        const key = frame.actionId ? `${socket.data.player.id}:${frame.actionId}` : undefined;
        const previous = key ? this.receipts.find((receipt) => receipt.key === key) : undefined;
        if (previous) {
          if (frame.id && previous.ack !== undefined) this.pending.push({ socket, frame: { ack: frame.id, data: previous.ack } });
          return;
        }
        const receipt: Receipt = { key: key ?? crypto.randomUUID() };
        const ack = frame.id ? (data: unknown) => {
          receipt.ack = structuredClone(data);
          this.pending.push({ socket, frame: { ack: frame.id, data } });
        } : undefined;
        if (!(await this.route(socket, frame))) await socket.dispatch(frame.event, frame.data ?? {}, ack);
        if (['room:create', 'room:join', 'room:resume'].includes(frame.event) && this.code
          && this.rooms.getRoomForPlayer(socket.data.player.id)?.code === this.code) {
          const directory = this.env.PLAYERS.get(this.env.PLAYERS.idFromName(socket.data.player.id));
          const response = await directory.fetch('https://player/claim', {
            method: 'POST', body: JSON.stringify({ code: this.code }),
          });
          if (!response.ok) throw new Error('Unable to synchronize room membership');
          const claim = await response.json() as { code: string; previousCode: string | null; version: number };
          if (claim.code !== this.code || !Number.isSafeInteger(claim.version)) throw new Error('Invalid room membership response');
          claimed = { ...claim, playerId: socket.data.player.id };
          if (claim.previousCode && claim.previousCode !== this.code) departed = {
            code: claim.previousCode, version: claim.version, playerId: socket.data.player.id,
          };
        }
        this.receipts.push(receipt);
        this.receipts = this.receipts.slice(-256);
      });
      claimed = undefined;
      if (departed) {
        const previous = this.env.ROOMS.get(this.env.ROOMS.idFromName(`room:${departed.code}`));
        // Notify after this room's commit to avoid distributed room lock cycles.
        this.ctx.waitUntil(previous.fetch('https://room/internal/remove-player', {
          method: 'POST', body: JSON.stringify(departed),
        }).catch(() => console.error('[room] Previous lobby notification deferred')));
      }
    } catch (error) {
      if (claimed) {
        const directory = this.env.PLAYERS.get(this.env.PLAYERS.idFromName(claimed.playerId));
        try {
          await directory.fetch('https://player/restore', { method: 'POST', body: JSON.stringify(claimed) });
        } catch { console.error('[room] Membership recovery deferred'); }
      }
      console.error('[room] Command failed:', error instanceof Error ? error.name : 'Unknown error');
      if (ws.readyState === 1) ws.send(JSON.stringify({ event: 'game:error', data: { message: 'Unable to complete this action. Please try again.' } }));
    }
  }

  async webSocketClose(ws: WebSocket, code = 1000, reason = ''): Promise<void> {
    if (ws.readyState !== 3) ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason);
    await this.transact(async () => {
      const attachment = ws.deserializeAttachment() as ConnectionAttachment;
      if (attachment.closed) return;
      const socket = this.attach(ws);
      this.io.remove(socket);
      await socket.dispatch('disconnect', {});
      attachment.closed = true;
      ws.serializeAttachment(attachment);
    });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    if (ws.readyState === 1) ws.close(1011, 'Connection error');
    await this.webSocketClose(ws);
  }
}
