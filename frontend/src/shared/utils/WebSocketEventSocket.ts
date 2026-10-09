type SocketListener = (...args: any[]) => void;

/** The event API used by the lobby and game, shared by both transports. */
export interface RealtimeSocket {
  readonly connected: boolean;
  readonly id?: string;
  on(event: string, listener: SocketListener): unknown;
  off(event: string, listener?: SocketListener): unknown;
  emit(event: string, ...args: any[]): unknown;
  timeout(milliseconds: number): { emit(event: string, ...args: any[]): unknown };
  removeAllListeners(event?: string): unknown;
  close(): unknown;
}

interface PendingAcknowledgement {
  callback: SocketListener;
  errorFirst: boolean;
  timer: ReturnType<typeof setTimeout>;
}

interface ResumeEvent {
  event: 'room:create' | 'room:join' | 'room:resume' | 'game:request-state';
  data?: unknown;
}

const HANDSHAKE_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const DEFAULT_ACK_TIMEOUT_MS = 5_000;

/** Native WebSockets with the small event interface the existing UI uses. */
export class WebSocketEventSocket implements RealtimeSocket {
  connected = false;
  id?: string;

  private readonly listeners = new Map<string, Set<SocketListener>>();
  private readonly acknowledgements = new Map<string, PendingAcknowledgement>();
  private socket: WebSocket | null = null;
  private endpoint: URL;
  private generation = 0;
  private acknowledgementId = 0;
  private retryAttempt = 0;
  private closed = false;
  private announcedConnection = false;
  private resumeEvent: ResumeEvent | null = null;
  private lastPongAt = 0;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(endpoint: string, private readonly token: string) {
    this.endpoint = new URL(endpoint, window.location.href);
    if (this.endpoint.protocol === 'http:') this.endpoint.protocol = 'ws:';
    if (this.endpoint.protocol === 'https:') this.endpoint.protocol = 'wss:';
    if (!['ws:', 'wss:'].includes(this.endpoint.protocol)) {
      throw new Error('The game connection URL must use HTTP or WebSocket.');
    }
    if (this.endpoint.pathname === '/') this.endpoint.pathname = '/ws';
    this.openConnection();
  }

  on(event: string, listener: SocketListener): this {
    const listeners = this.listeners.get(event) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener?: SocketListener): this {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  emit(event: string, ...args: any[]): this {
    return this.sendEvent(event, args, DEFAULT_ACK_TIMEOUT_MS, false);
  }

  timeout(milliseconds: number): { emit: (event: string, ...args: any[]) => WebSocketEventSocket } {
    const duration = Number.isFinite(milliseconds) ? Math.max(1, milliseconds) : DEFAULT_ACK_TIMEOUT_MS;
    return { emit: (event, ...args) => this.sendEvent(event, args, duration, true) };
  }

  close(): this {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.loseConnection('client disconnect');
    return this;
  }

  private notify(event: string, ...args: any[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  private openConnection(suppressConnect = false): void {
    if (this.closed) return;
    const generation = ++this.generation;
    const url = new URL(this.endpoint);
    url.searchParams.set('token', this.token);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.notify('connect_error', new Error('Could not connect to the game.'));
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    const isCurrent = () => generation === this.generation && socket === this.socket;

    this.handshakeTimer = setTimeout(() => {
      if (!isCurrent()) return;
      this.notify('connect_error', new Error('The game connection timed out.'));
      this.loseConnection('handshake timeout');
    }, HANDSHAKE_TIMEOUT_MS);

    socket.onmessage = (message) => {
      if (!isCurrent() || typeof message.data !== 'string') return;
      if (message.data === 'pong') {
        this.lastPongAt = Date.now();
        return;
      }
      let frame: any;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (!frame || typeof frame !== 'object') return;

      if (frame.event === 'connect_error') {
        this.closed = true;
        this.notify('connect_error', new Error(frame.data?.message ?? 'Your game session could not be restored.'));
        this.loseConnection('authentication failed');
        return;
      }
      if (frame.event === 'connect') {
        if (this.connected || typeof frame.data?.id !== 'string') return;
        clearTimeout(this.handshakeTimer);
        this.id = frame.data.id;
        this.connected = true;
        this.retryAttempt = 0;
        this.startHeartbeat();
        const resume = this.resumeEvent;
        this.resumeEvent = null;
        if (resume) this.emit(resume.event, resume.data ?? {});
        if (!suppressConnect || !this.announcedConnection) {
          this.announcedConnection = true;
          this.notify('connect');
        }
        return;
      }
      if (frame.redirect) {
        this.followRedirect(frame.redirect, frame.resume);
        return;
      }
      if (typeof frame.ack === 'string') {
        const pending = this.acknowledgements.get(frame.ack);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.acknowledgements.delete(frame.ack);
        if (pending.errorFirst) pending.callback(null, frame.data);
        else pending.callback(frame.data);
        return;
      }
      if (this.connected && typeof frame.event === 'string') this.notify(frame.event, frame.data);
    };
    socket.onerror = () => {
      if (isCurrent()) this.notify('connect_error', new Error('Could not connect to the game.'));
    };
    socket.onclose = (event) => {
      if (!isCurrent()) return;
      if ([1008, 4401, 4403].includes(event.code)) this.closed = true;
      this.loseConnection(event.reason || 'connection closed');
    };
  }

  private followRedirect(redirect: unknown, resume: unknown): void {
    if (typeof redirect !== 'string' || !resume || typeof resume !== 'object') return;
    const event = resume as ResumeEvent;
    if (!['room:create', 'room:join', 'room:resume', 'game:request-state'].includes(event.event)) return;
    let endpoint: URL;
    try { endpoint = new URL(redirect, this.endpoint); } catch { return; }
    // A routing frame must never send this learner's token to another origin.
    if (endpoint.origin !== this.endpoint.origin || endpoint.pathname !== '/ws') return;
    this.endpoint = endpoint;
    this.resumeEvent = event;
    this.connected = false;
    this.clearConnectionTimers();
    this.failAcknowledgements('The connection moved to a game room.');
    const previous = this.socket;
    this.socket = null;
    ++this.generation;
    previous?.close();
    this.openConnection(true);
  }

  private sendEvent(event: string, args: any[], timeout: number, errorFirst: boolean): this {
    const lastArgument = args[args.length - 1];
    const callback = typeof lastArgument === 'function' ? lastArgument as SocketListener : undefined;
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (callback) this.failCallback(callback, errorFirst, 'Reconnect before trying again.');
      return this;
    }
    const data = args.length && typeof args[0] !== 'function' ? args[0] : {};
    const id = callback ? String(++this.acknowledgementId) : undefined;
    if (callback && id) {
      const timer = setTimeout(() => {
        this.acknowledgements.delete(id);
        this.failCallback(callback, errorFirst, 'The game did not acknowledge the request.');
      }, timeout);
      this.acknowledgements.set(id, { callback, errorFirst, timer });
    }
    try { this.socket.send(JSON.stringify({ event, data, actionId: crypto.randomUUID(), ...(id ? { id } : {}) })); }
    catch { this.loseConnection('could not send'); }
    return this;
  }

  private failCallback(callback: SocketListener, errorFirst: boolean, message: string): void {
    if (errorFirst) callback(new Error(message));
    else callback({ success: false, error: message });
  }

  private failAcknowledgements(message: string): void {
    for (const pending of this.acknowledgements.values()) {
      clearTimeout(pending.timer);
      this.failCallback(pending.callback, pending.errorFirst, message);
    }
    this.acknowledgements.clear();
  }

  private startHeartbeat(): void {
    this.lastPongAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || !this.connected) return;
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.loseConnection('heartbeat timeout');
        return;
      }
      try { this.socket.send('ping'); }
      catch { this.loseConnection('heartbeat failed'); }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearConnectionTimers(): void {
    clearTimeout(this.handshakeTimer);
    clearInterval(this.heartbeatTimer);
  }

  private loseConnection(reason: string): void {
    const previous = this.socket;
    this.socket = null;
    ++this.generation;
    this.connected = false;
    this.clearConnectionTimers();
    this.failAcknowledgements('The game connection was interrupted.');
    if (this.announcedConnection) {
      this.announcedConnection = false;
      this.notify('disconnect', reason);
    }
    previous?.close();
    if (!this.closed) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    clearTimeout(this.retryTimer);
    const delay = Math.min(500 * 2 ** this.retryAttempt++, 10_000);
    this.retryTimer = setTimeout(() => this.openConnection(), delay);
  }
}
