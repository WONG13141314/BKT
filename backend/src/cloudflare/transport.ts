import type { Server, Socket } from 'socket.io';
import type { ConnectionAttachment } from './types';

type Handler = (...args: any[]) => unknown;
type Send = (socket: HibernatingSocket, frame: unknown) => void;

/** The subset of Socket.IO used by the unchanged game handlers, over native WS. */
export class HibernatingSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly id: string;
  readonly data: { player: ConnectionAttachment['player']; gameId?: string };
  readonly rooms: Set<string>;

  constructor(readonly ws: WebSocket, readonly attachment: ConnectionAttachment, private readonly send: Send,
    private readonly membershipChanged: () => void = () => {}) {
    this.id = attachment.id;
    this.data = { player: attachment.player, gameId: attachment.gameId };
    this.rooms = new Set(attachment.rooms);
  }

  on(event: string, handler: Handler): this {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  emit(event: string, data: unknown): this {
    this.send(this, { event, data });
    return this;
  }

  join(room: string): void { this.rooms.add(room); this.membershipChanged(); }
  leave(room: string): void { this.rooms.delete(room); this.membershipChanged(); }

  async dispatch(event: string, data: unknown, ack?: (data: unknown) => void): Promise<void> {
    for (const handler of this.handlers.get(event) ?? []) await handler(data, ack);
  }

  saveAttachment(): void {
    this.attachment.rooms = [...this.rooms];
    this.attachment.gameId = this.data.gameId;
    this.ws.serializeAttachment(this.attachment);
  }

  asSocket(): Socket { return this as unknown as Socket; }
}

export class RoomSocketServer {
  readonly sockets = {
    sockets: new Map<string, HibernatingSocket>(),
    adapter: { rooms: new Map<string, Set<string>>() },
  };

  add(socket: HibernatingSocket): void { this.sockets.sockets.set(socket.id, socket); this.sync(); }
  remove(socket: HibernatingSocket): void { this.sockets.sockets.delete(socket.id); this.sync(); }

  sync(): void {
    this.sockets.adapter.rooms.clear();
    for (const socket of this.sockets.sockets.values()) {
      for (const room of socket.rooms) {
        const members = this.sockets.adapter.rooms.get(room) ?? new Set<string>();
        members.add(socket.id);
        this.sockets.adapter.rooms.set(room, members);
      }
    }
  }

  to(room: string): { emit: (event: string, data: unknown) => void } {
    return { emit: (event, data) => {
      // Read live membership: handlers may join immediately before publishing.
      for (const socket of this.sockets.sockets.values()) if (socket.rooms.has(room)) socket.emit(event, data);
    } };
  }

  asServer(): Server { this.sync(); return this as unknown as Server; }
}
