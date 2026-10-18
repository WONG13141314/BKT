import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLobby } from './GameLobby';

const socket = vi.hoisted(() => ({ id: 'socket-1', connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() }));
vi.mock('../../../shared/contexts/SocketContext', () => ({
  useSocket: () => ({ socket, isConnected: true, connectSocket: vi.fn() }),
}));
vi.mock('../../auth/PlayerContext', () => ({
  usePlayer: () => ({ player: { id: 'host-1', displayName: 'Aina', avatar: 'top_hat' } }),
}));
vi.mock('../../../shared/audio/AudioContext', () => ({ useAudio: () => ({ play: vi.fn() }), useAudioScene: vi.fn() }));
vi.mock('./board.preload', () => ({ preloadBoardScenes: vi.fn() }));

function receive(event: string, data: unknown) {
  const calls = socket.on.mock.calls.filter(([name]) => name === event);
  const handler = calls[calls.length - 1]?.[1];
  if (!handler) throw new Error(`Missing handler: ${event}`);
  act(() => { handler(data); });
}

describe('hosting a room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows the waiting room at once, with the code and controls filled in when the room is created', () => {
    render(<MemoryRouter initialEntries={['/lobby?action=host']}><GameLobby /></MemoryRouter>);
    expect(socket.emit).toHaveBeenCalledWith('room:create');
    expect(screen.queryByText('Creating room...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting Room' })).toBeVisible();
    expect(screen.getByText('Aina')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Creating room code' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add Bot/ })).toBeDisabled();

    receive('room:update', {
      code: 'ABC234', hostId: 'host-1', maxPlayers: 4, status: 'waiting',
      players: [{ id: 'host-1', name: 'Aina', avatar: 'top_hat', isReady: true, isBot: false }],
    });
    expect(screen.getByRole('button', { name: 'Copy room code ABC234' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Add Bot/ })).toBeEnabled();
  });
});
