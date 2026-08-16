import { SocketPresence } from '../presence.manager';

describe('SocketPresence', () => {
  it('keeps a player connected until the final socket closes', () => {
    const presence = new SocketPresence();

    presence.connect('p1', 's1');
    presence.connect('p1', 's2');

    expect(presence.disconnect('p1', 's1')).toBe(1);
    expect(presence.disconnect('p1', 's2')).toBe(0);
  });

  it('does not double-count a socket that reconnects through the same id', () => {
    const presence = new SocketPresence();

    presence.connect('p1', 's1');
    presence.connect('p1', 's1');

    expect(presence.count('p1')).toBe(1);
    expect(presence.disconnect('p1', 's1')).toBe(0);
  });
});
