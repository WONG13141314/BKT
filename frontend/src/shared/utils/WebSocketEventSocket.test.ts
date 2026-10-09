import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketEventSocket } from './WebSocketEventSocket';

class TestWebSocket {
  static readonly OPEN = 1;
  static instances: TestWebSocket[] = [];
  readonly url: string;
  readyState = TestWebSocket.OPEN;
  sent: string[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: URL | string) {
    this.url = String(url);
    TestWebSocket.instances.push(this);
  }

  send(message: string): void { this.sent.push(message); }
  close(): void { this.readyState = 3; }
  receive(frame: unknown): void { this.onmessage?.({ data: JSON.stringify(frame) }); }
  receiveText(data: string): void { this.onmessage?.({ data }); }
  disconnect(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: '' });
  }
}

describe('native game event transport', () => {
  let client: WebSocketEventSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    TestWebSocket.instances = [];
    vi.stubGlobal('WebSocket', TestWebSocket);
    client = new WebSocketEventSocket('https://game.example/ws', 'test-token');
  });

  afterEach(() => {
    client.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the authenticated greeting and gives every command a separate action identity', () => {
    const connected = vi.fn();
    client.on('connect', connected);
    const socket = TestWebSocket.instances[0];
    expect(socket.url).toBe('wss://game.example/ws?token=test-token');
    client.emit('game:roll', { gameId: 'game_ONE' });
    expect(socket.sent).toEqual([]);

    socket.receive({ event: 'connect', data: { id: 'connection-one' } });
    expect(client.connected).toBe(true);
    expect(client.id).toBe('connection-one');
    expect(connected).toHaveBeenCalledTimes(1);
    client.emit('game:roll', { gameId: 'game_ONE' });
    client.emit('game:end-turn', { gameId: 'game_ONE' });
    const commands = socket.sent.map((message) => JSON.parse(message));
    expect(commands[0]).toMatchObject({ event: 'game:roll', data: { gameId: 'game_ONE' } });
    expect(commands[0].actionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(commands[1].actionId).not.toBe(commands[0].actionId);
    expect(commands[0]).not.toHaveProperty('id');
  });

  it('moves from the learner gateway to the room without restarting lobby listeners', () => {
    const connected = vi.fn();
    const disconnected = vi.fn();
    const roomUpdated = vi.fn();
    client.on('connect', connected).on('disconnect', disconnected).on('room:update', roomUpdated);
    const gateway = TestWebSocket.instances[0];
    gateway.receive({ event: 'connect', data: { id: 'gateway' } });
    gateway.receive({ redirect: '/ws?room=ABCD', resume: { event: 'room:create', data: { code: 'ABCD' } } });
    const room = TestWebSocket.instances[1];
    expect(room.url).toBe('wss://game.example/ws?room=ABCD&token=test-token');
    expect(client.connected).toBe(false);
    expect(disconnected).not.toHaveBeenCalled();
    room.receive({ event: 'connect', data: { id: 'room-connection' } });
    expect(connected).toHaveBeenCalledTimes(1);
    expect(JSON.parse(room.sent[0])).toMatchObject({ event: 'room:create', data: { code: 'ABCD' } });
    room.receive({ event: 'room:update', data: { code: 'ABCD' } });
    expect(roomUpdated).toHaveBeenCalledWith({ code: 'ABCD' });
    gateway.receive({ event: 'room:deleted', data: {} });
    expect(client.connected).toBe(true);
  });

  it('reconnects to the selected room and never replays disconnected game actions', () => {
    const connected = vi.fn();
    const disconnected = vi.fn();
    client.on('connect', connected).on('disconnect', disconnected);
    const gateway = TestWebSocket.instances[0];
    gateway.receive({ event: 'connect', data: { id: 'gateway' } });
    gateway.receive({ redirect: '/ws?room=ABCD', resume: { event: 'room:join', data: { code: 'ABCD' } } });
    const room = TestWebSocket.instances[1];
    room.receive({ event: 'connect', data: { id: 'room-one' } });
    room.disconnect();
    client.emit('game:roll', { gameId: 'game_ABCD' });
    vi.advanceTimersByTime(500);
    const recovered = TestWebSocket.instances[2];
    expect(recovered.url).toBe(room.url);
    recovered.receive({ event: 'connect', data: { id: 'room-two' } });
    expect(connected).toHaveBeenCalledTimes(2);
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(recovered.sent).toEqual([]);
  });

  it('routes a directly refreshed game page and reissues its state request', () => {
    const connected = vi.fn();
    client.on('connect', connected);
    const gateway = TestWebSocket.instances[0];
    gateway.receive({ event: 'connect', data: { id: 'gateway' } });
    client.emit('game:request-state', { gameId: 'game_ABCD' });
    gateway.receive({ redirect: '/ws?room=ABCD', resume: { event: 'game:request-state', data: { gameId: 'game_ABCD' } } });
    const room = TestWebSocket.instances[1];
    room.receive({ event: 'connect', data: { id: 'room-one' } });
    expect(JSON.parse(room.sent[0])).toMatchObject({ event: 'game:request-state', data: { gameId: 'game_ABCD' } });
    expect(connected).toHaveBeenCalledTimes(1);
  });

  it('matches hint acknowledgements and rejects interrupted or unanswered requests', () => {
    const socket = TestWebSocket.instances[0];
    socket.receive({ event: 'connect', data: { id: 'one' } });
    const success = vi.fn();
    client.timeout(5_000).emit('game:request-hint', { challengeId: 'question-one' }, success);
    const request = JSON.parse(socket.sent[0]);
    expect(request.id).toEqual(expect.any(String));
    expect(request.actionId).toEqual(expect.any(String));
    expect(request.actionId).not.toBe(request.id);
    socket.receive({ ack: request.id, data: { success: true } });
    expect(success).toHaveBeenCalledWith(null, { success: true });
    vi.advanceTimersByTime(5_000);
    expect(success).toHaveBeenCalledTimes(1);

    const timeout = vi.fn();
    client.timeout(5_000).emit('game:request-hint', {}, timeout);
    vi.advanceTimersByTime(5_000);
    expect(timeout).toHaveBeenCalledWith(expect.any(Error));
    const interrupted = vi.fn();
    client.timeout(5_000).emit('game:request-hint', {}, interrupted);
    socket.disconnect();
    expect(interrupted).toHaveBeenCalledWith(expect.any(Error));
    vi.advanceTimersByTime(5_000);
    expect(interrupted).toHaveBeenCalledTimes(1);
  });

  it('uses literal heartbeat auto-responses and recovers a stalled connection', () => {
    const socket = TestWebSocket.instances[0];
    socket.receive({ event: 'connect', data: { id: 'one' } });
    vi.advanceTimersByTime(25_000);
    expect(socket.sent).toEqual(['ping']);
    socket.receiveText('pong');
    vi.advanceTimersByTime(50_000);
    expect(client.connected).toBe(true);
    vi.advanceTimersByTime(25_000);
    expect(client.connected).toBe(false);
    vi.advanceTimersByTime(500);
    expect(TestWebSocket.instances).toHaveLength(2);
  });

  it('bounds an unfinished handshake and stops retrying an explicitly invalid session', () => {
    const failed = vi.fn();
    client.on('connect_error', failed);
    vi.advanceTimersByTime(10_000);
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
    vi.advanceTimersByTime(500);
    expect(TestWebSocket.instances).toHaveLength(2);
    TestWebSocket.instances[1].receive({ event: 'connect_error', data: { message: 'Invalid token' } });
    expect(failed.mock.calls[1][0].message).toBe('Invalid token');
    vi.advanceTimersByTime(60_000);
    expect(TestWebSocket.instances).toHaveLength(2);
  });

  it('does not forward a learner token to a different redirect origin', () => {
    const socket = TestWebSocket.instances[0];
    socket.receive({ event: 'connect', data: { id: 'one' } });
    socket.receive({ redirect: 'wss://other.example/ws?room=ABCD', resume: { event: 'room:join', data: {} } });
    expect(TestWebSocket.instances).toHaveLength(1);
    expect(client.connected).toBe(true);
  });
});
