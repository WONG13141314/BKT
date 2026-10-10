import type { PublicPlayer } from '../features/auth/auth.types';

/** Transport-neutral events used by the room rules and native WebSocket facade. */
export interface RealtimeSocket {
  readonly id: string;
  readonly data: { player: PublicPlayer; gameId?: string };
  on(event: string, listener: (...args: any[]) => unknown): unknown;
  emit(event: string, data: unknown): unknown;
  join(room: string): unknown;
  leave(room: string): unknown;
}

export interface RealtimeServer {
  readonly sockets: {
    sockets: Map<string, RealtimeSocket>;
    adapter: { rooms: Map<string, Set<string>> };
  };
  to(room: string): { emit(event: string, data: unknown): unknown };
}
