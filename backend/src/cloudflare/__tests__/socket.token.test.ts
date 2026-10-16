import { readSocketToken, socketProtocolHeaders, SOCKET_PROTOCOL } from '../auth';

describe('game connection token', () => {
  it('reads the token from the offered subprotocols, keeping it out of the URL', () => {
    const request = new Request('https://game.example/ws?room=ABCDEF', {
      headers: { 'sec-websocket-protocol': `${SOCKET_PROTOCOL}, header.jwt.token` },
    });
    expect(readSocketToken(request)).toEqual({ token: 'header.jwt.token', viaProtocol: true });
    expect(socketProtocolHeaders(true)).toEqual({ 'sec-websocket-protocol': SOCKET_PROTOCOL });
  });

  it('still accepts the query token from pages loaded before the change', () => {
    const request = new Request('https://game.example/ws?token=legacy.jwt.token');
    expect(readSocketToken(request)).toEqual({ token: 'legacy.jwt.token', viaProtocol: false });
    expect(socketProtocolHeaders(false)).toBeUndefined();
  });

  it('ignores subprotocols that are not the game protocol', () => {
    const request = new Request('https://game.example/ws', {
      headers: { 'sec-websocket-protocol': 'chat, something.else' },
    });
    expect(readSocketToken(request)).toEqual({ token: null, viaProtocol: false });
  });
});
