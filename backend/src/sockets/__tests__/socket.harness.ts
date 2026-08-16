import type { Server, Socket } from 'socket.io';

type SocketListener = (...args: any[]) => unknown;

export type SocketHarness = Socket & {
  emit: Socket['emit'] & jest.Mock;
  trigger(event: string, ...args: any[]): Promise<unknown>;
};

export type ServerHarness = Server & {
  roomEmitter: { emit: jest.Mock };
};

let socketNumber = 0;

export function makeSocket(data: Record<string, unknown> = {}): SocketHarness {
  const listeners = new Map<string, SocketListener[]>();
  const socket = {
    id: `socket-${socketNumber++}`,
    data,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn((event: string, listener: SocketListener) => {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
      return socket;
    }),
    trigger: async (event: string, ...args: any[]) => {
      let result: unknown;
      for (const listener of listeners.get(event) ?? []) {
        result = await listener(...args);
      }
      return result;
    },
  } as unknown as SocketHarness;
  return socket;
}

export function makeServer(sockets: SocketHarness[], gameId = 'game_TEST'): ServerHarness {
  const roomEmitter = { emit: jest.fn() };
  const socketRoom = `room:${gameId.replace('game_', '')}`;
  return {
    to: jest.fn(() => roomEmitter),
    sockets: {
      adapter: { rooms: new Map([[socketRoom, new Set(sockets.map((socket) => socket.id))]]) },
      sockets: new Map(sockets.map((socket) => [socket.id, socket])),
    },
    roomEmitter,
  } as unknown as ServerHarness;
}
