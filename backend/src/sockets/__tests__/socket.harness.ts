import type { Socket } from 'socket.io';

export function makeSocket(data: Record<string, unknown> = {}): Socket {
  return {
    data,
    emit: jest.fn(),
  } as unknown as Socket;
}
