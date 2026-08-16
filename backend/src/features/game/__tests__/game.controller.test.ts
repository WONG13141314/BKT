import type { Request, Response } from 'express';
import { gameController } from '../game.controller';
import { gameService } from '../game.service';
import { makeGameState, makePrivateChallenge } from '../../../test/game.fixtures';

function makeRequest(playerId: string): Request {
  return {
    params: { id: 'game_TEST' },
    player: {
      id: playerId,
      displayName: 'Aina',
      avatar: 'star',
      role: 'PLAYER',
      isClaimed: false,
      username: null,
    },
  } as unknown as Request;
}

function makeResponse(): Response & { status: jest.Mock; json: jest.Mock } {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('game controller public state access', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns only the public state to an authenticated game seat', async () => {
    const state = makeGameState({ currentChallenge: makePrivateChallenge({ correctIndex: 2 }) });
    state.players[0].masteryStates = { Addition: 0.91 };
    jest.spyOn(gameService, 'getGame').mockResolvedValue(state);
    const response = makeResponse();

    await gameController.getById(makeRequest('db-player-1'), response);

    const payload = response.json.mock.calls[0][0];
    expect(payload.state).not.toHaveProperty('currentChallenge');
    expect(payload.state.players[0]).not.toHaveProperty('masteryStates');
    expect(JSON.stringify(payload)).not.toContain('correctIndex');
  });

  it('rejects an authenticated player who does not own a game seat', async () => {
    jest.spyOn(gameService, 'getGame').mockResolvedValue(makeGameState());
    const response = makeResponse();

    await gameController.getById(makeRequest('db-outsider'), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: 'You are not a player in this game' });
  });

  it('does not authorize an account that only matches a seat id', async () => {
    const state = makeGameState();
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    jest.spyOn(gameService, 'getGame').mockResolvedValue(state);
    const response = makeResponse();

    await gameController.getById(makeRequest('alice'), response);

    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('does not create a game when the account matches only an untrusted seat id', async () => {
    const request = makeRequest('alice') as Request & { body: unknown };
    request.body = {
      players: [
        { id: 'alice', playerId: 'bob' },
        { id: 'seat-2', playerId: 'carol' },
      ],
    };
    const createGame = jest.spyOn(gameService, 'createGame');
    const response = makeResponse();

    await gameController.create(request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(createGame).not.toHaveBeenCalled();
  });
});
