import { assignTokens, PLAYER_TOKENS, tokenForAvatar } from '../game.tokens';
import { RoomManager } from '../../../sockets/lobby.manager';

describe('player tokens', () => {
  it('maps every profile avatar to a distinct piece', () => {
    const tokens = ['car', 'tophat', 'ship', 'boot', 'dog', 'cat', 'duck', 'wheelbarrow'].map(tokenForAvatar);
    expect(new Set(tokens).size).toBe(8);
    expect(tokens.every((token) => token && PLAYER_TOKENS.includes(token))).toBe(true);
  });

  it('keeps the earlier seat on a contested or retired avatar and gives later seats free pieces', () => {
    expect(assignTokens(['duck', 'duck', 'iron', 'race_car'])).toEqual(['rubber_duck', 'race_car', 'top_hat', 'battleship']);
  });
});

describe('lobby token choice', () => {
  it('gives a joining player a free piece and refuses a piece another player holds', () => {
    const rooms = new RoomManager();
    const room = rooms.createRoom('host', 'Host', 'cat');
    rooms.joinRoom(room.code, 'guest', 'Guest', 'cat');
    expect(room.players.get('guest')?.avatar).not.toBe('cat');

    expect(rooms.setAvatar('guest', 'cat').error).toMatch(/already has that token/);
    expect(rooms.setAvatar('guest', 'thimble').error).toMatch(/eight tokens/);
    expect(rooms.setAvatar('guest', 'duck').room).toBe(room);
    expect(room.players.get('guest')?.avatar).toBe('duck');
  });

  it('gives each bot a piece no one else holds', () => {
    const rooms = new RoomManager();
    const room = rooms.createRoom('host', 'Host', 'duck');
    rooms.addBot(room.code, 'host');
    rooms.addBot(room.code, 'host');
    const avatars = [...room.players.values()].map((player) => player.avatar);
    expect(new Set(avatars).size).toBe(3);
  });
});
