import { gameService } from '../../features/game/game.service';
import { registerGameHandlers } from '../game.handlers';
import { makeGameState } from '../../test/game.fixtures';
import { registerLobbyHandlers } from '../lobby.handlers';
import { roomManager } from '../lobby.manager';
import { SocketPresence } from '../presence.manager';
import { makeServer, makeSocket } from './socket.harness';

describe('room:start', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates one game for two rapid start events and gives every room socket the game id', async () => {
    const host = makeSocket({ player: { id: 'host', displayName: 'Host', avatar: 'ship' } });
    const guest = makeSocket({ player: { id: 'guest', displayName: 'Guest', avatar: 'boot' } });
    const room = roomManager.createRoom('host', 'Host', 'ship');
    roomManager.joinRoom(room.code, 'guest', 'Guest', 'boot');
    roomManager.toggleReady('guest');
    const io = makeServer([host, guest], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect('host', host.id);
    presence.connect('guest', guest.id);
    const createGame = jest
      .spyOn(gameService, 'createGame')
      .mockResolvedValue(makeGameState({ id: `game_${room.code}` }));

    registerLobbyHandlers(io, host, presence);

    await Promise.all([host.trigger('room:start'), host.trigger('room:start')]);

    expect(createGame).toHaveBeenCalledTimes(1);
    expect(roomManager.getRoom(room.code)?.status).toBe('playing');
    expect(host.data.gameId).toBe(`game_${room.code}`);
    expect(guest.data.gameId).toBe(`game_${room.code}`);
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:start', { roomCode: room.code });

    roomManager.removePlayer('host');
    roomManager.removePlayer('guest');
  });

  it('returns a room to waiting when game creation fails', async () => {
    const host = makeSocket({ player: { id: 'host-failure', displayName: 'Host', avatar: 'ship' } });
    const room = roomManager.createRoom('host-failure', 'Host', 'ship');
    roomManager.addBot(room.code, 'host-failure');
    const io = makeServer([host], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect('host-failure', host.id);
    jest.spyOn(gameService, 'createGame').mockRejectedValue(new Error('database unavailable'));

    registerLobbyHandlers(io, host, presence);
    await Promise.all([host.trigger('room:start'), host.trigger('room:start')]);

    expect(roomManager.getRoom(room.code)?.status).toBe('waiting');
    expect(gameService.createGame).toHaveBeenCalledTimes(1);
    expect(host.emit).toHaveBeenCalledTimes(1);
    expect(host.emit).toHaveBeenCalledWith('room:error', {
      message: 'Unable to start the game. Please try again.',
    });

    roomManager.removePlayer('host-failure');
  });

  it('cancels an in-flight start when the reserved roster changes', async () => {
    const host = makeSocket({ player: { id: 'host-disconnect', displayName: 'Host', avatar: 'ship' } });
    const room = roomManager.createRoom('host-disconnect', 'Host', 'ship');
    roomManager.addBot(room.code, 'host-disconnect');
    const io = makeServer([host], `game_${room.code}`);
    const presence = new SocketPresence();
    presence.connect('host-disconnect', host.id);
    let resolveCreate!: (state: ReturnType<typeof makeGameState>) => void;
    jest.spyOn(gameService, 'createGame').mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const removeGame = jest.spyOn(gameService, 'removeGame');

    registerLobbyHandlers(io, host, presence);
    registerGameHandlers(io, host, presence);

    const start = host.trigger('room:start');
    await Promise.resolve();
    await host.trigger('disconnect');
    resolveCreate(makeGameState({ id: `game_${room.code}` }));
    await start;

    expect(removeGame).toHaveBeenCalledWith(`game_${room.code}`);
    expect(io.roomEmitter.emit).not.toHaveBeenCalledWith('game:start', expect.anything());
    expect(host.data.gameId).toBeUndefined();
  });
});
