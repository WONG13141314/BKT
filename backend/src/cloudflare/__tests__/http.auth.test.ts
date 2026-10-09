import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { handleApiRequest } from '../http';
import type { AuthDatabase } from '../auth';
import type { DatabasePlayer } from '../database';
import type { WorkerEnv } from '../types';

const env = {
  DATABASE_URL: 'postgresql://test:test@synthetic.invalid/test',
  JWT_SECRET: 'synthetic-secret-for-isolated-auth-tests',
  JWT_EXPIRES_IN: '90d',
} as WorkerEnv;

function databaseFixture(): { database: AuthDatabase; players: Map<string, DatabasePlayer> } {
  const players = new Map<string, DatabasePlayer>();
  const database: AuthDatabase = {
    findPlayerById: jest.fn(async (id) => players.get(id) ?? null),
    findPlayerByUsername: jest.fn(async (username) =>
      [...players.values()].find((player) => player.username === username) ?? null),
    createGuest: jest.fn(async (displayName, avatar) => {
      const player: DatabasePlayer = {
        id: `synthetic-player-${players.size + 1}`, displayName, avatar,
        role: 'PLAYER', isClaimed: false, username: null, pinHash: null,
      };
      players.set(player.id, player);
      return player;
    }),
    touchPlayer: jest.fn(async (id) => players.get(id) ?? null),
    claimPlayer: jest.fn(async (id, username, pinHash) => {
      const player = players.get(id);
      if (!player) return null;
      const updated = { ...player, username, pinHash, isClaimed: true };
      players.set(id, updated);
      return updated;
    }),
    updateProfile: jest.fn(async (id, data) => {
      const player = players.get(id);
      if (!player) return null;
      const updated = { ...player, ...data };
      players.set(id, updated);
      return updated;
    }),
  };
  return { database, players };
}

function request(path: string, method = 'GET', body?: unknown, token?: string): Request {
  return new Request(`https://synthetic.invalid${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('Cloudflare auth HTTP contracts', () => {
  it('serves the health route before requiring database secrets', async () => {
    const response = await handleApiRequest(request('/api/health'), {} as WorkerEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', environment: 'production' });
  });

  it('creates the same anonymous profile response and a Render-compatible JWT', async () => {
    const { database } = databaseFixture();
    const response = await handleApiRequest(
      request('/api/auth/guest', 'POST', { displayName: '  Hana  ' }), env, database,
    );
    expect(response.status).toBe(201);
    const body = await response.json() as { player: DatabasePlayer; token: string };
    expect(body.player).toEqual({
      id: 'synthetic-player-1', displayName: 'Hana', avatar: 'tophat',
      role: 'PLAYER', isClaimed: false, username: null,
    });
    expect(body.player).not.toHaveProperty('pinHash');
    expect(jwt.verify(body.token, env.JWT_SECRET)).toMatchObject({ playerId: body.player.id });
  });

  it('accepts an existing Render token, refreshes it, and preserves identity when restyling', async () => {
    const { database } = databaseFixture();
    const player = await database.createGuest('Hana', 'car');
    const oldToken = jwt.sign({ playerId: player.id }, env.JWT_SECRET, { expiresIn: '90d' });
    const me = await handleApiRequest(request('/api/auth/me', 'GET', undefined, oldToken), env, database);
    expect((await me.json() as { player: DatabasePlayer }).player.id).toBe(player.id);
    const refresh = await handleApiRequest(
      request('/api/auth/refresh', 'POST', undefined, oldToken), env, database,
    );
    const refreshed = await refresh.json() as { player: DatabasePlayer; token: string };
    expect(refreshed.player.id).toBe(player.id);
    expect(jwt.verify(refreshed.token, env.JWT_SECRET)).toMatchObject({ playerId: player.id });
    const updated = await handleApiRequest(request(
      '/api/auth/me', 'PATCH', { displayName: 'Aina', avatar: 'dog' }, refreshed.token,
    ), env, database);
    expect(await updated.json()).toMatchObject({ player: { id: player.id, displayName: 'Aina', avatar: 'dog' } });
    expect(database.createGuest).toHaveBeenCalledTimes(1);
  });

  it('claims a profile at bcrypt cost 10 and restores the same identity on another device', async () => {
    const { database, players } = databaseFixture();
    const player = await database.createGuest('Hana', 'car');
    const token = jwt.sign({ playerId: player.id }, env.JWT_SECRET);
    const claimed = await handleApiRequest(request(
      '/api/auth/claim', 'POST', { username: '  HANA_1 ', pin: '123456' }, token,
    ), env, database);
    expect(claimed.status).toBe(200);
    const publicBody = await claimed.json() as { player: DatabasePlayer };
    expect(publicBody.player).toMatchObject({ id: player.id, isClaimed: true, username: 'hana_1' });
    expect(publicBody.player).not.toHaveProperty('pinHash');
    expect(bcrypt.getRounds(players.get(player.id)!.pinHash!)).toBe(10);
    const signedIn = await handleApiRequest(request(
      '/api/auth/signin', 'POST', { username: 'HANA_1', pin: '123456' },
    ), env, database);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ player: { id: player.id }, token: expect.any(String) });
  });

  it('returns validation errors and rejects unauthenticated changes', async () => {
    const { database } = databaseFixture();
    const guest = await handleApiRequest(request(
      '/api/auth/guest', 'POST', { displayName: 'x' },
    ), env, database);
    expect(guest.status).toBe(400);
    expect(await guest.json()).toMatchObject({ message: 'Nickname must be at least 2 characters', errors: expect.any(Array) });
    expect(database.createGuest).not.toHaveBeenCalled();
    const update = await handleApiRequest(request(
      '/api/auth/me', 'PATCH', { displayName: 'Someone' },
    ), env, database);
    expect(update.status).toBe(401);
    expect(await update.json()).toEqual({ message: 'Authentication required' });
    expect(database.updateProfile).not.toHaveBeenCalled();
  });

  it('uses one failure message for an unknown username or incorrect PIN', async () => {
    const { database } = databaseFixture();
    const player = await database.createGuest('Hana', 'car');
    await database.claimPlayer(player.id, 'hana', await bcrypt.hash('123456', 10));
    for (const username of ['hana', 'unknown']) {
      const response = await handleApiRequest(request(
        '/api/auth/signin', 'POST', { username, pin: '654321' },
      ), env, database);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ message: 'Wrong username or PIN' });
    }
  });

  it('handles a username uniqueness race as a conflict', async () => {
    const { database } = databaseFixture();
    const player = await database.createGuest('Hana', 'car');
    jest.mocked(database.claimPlayer).mockRejectedValueOnce({ code: '23505' });
    const response = await handleApiRequest(request(
      '/api/auth/claim', 'POST', { username: 'hana', pin: '123456' },
      jwt.sign({ playerId: player.id }, env.JWT_SECRET),
    ), env, database);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'That username is already taken' });
  });

  it('distinguishes a removed profile from an invalid or expired token', async () => {
    const { database } = databaseFixture();
    const missing = await handleApiRequest(request(
      '/api/auth/me', 'GET', undefined, jwt.sign({ playerId: 'removed' }, env.JWT_SECRET),
    ), env, database);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ message: 'Profile no longer exists' });
    for (const token of [
      'invalid-token', jwt.sign({ playerId: 'removed' }, env.JWT_SECRET, { expiresIn: -1 }),
      jwt.sign({ playerId: 'removed' }, 'another-synthetic-secret'),
    ]) {
      const response = await handleApiRequest(request('/api/auth/me', 'GET', undefined, token), env, database);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ message: 'Authentication required' });
    }
  });

  it('returns a controlled error for malformed JSON without touching identity rows', async () => {
    const { database } = databaseFixture();
    const response = await handleApiRequest(new Request('https://synthetic.invalid/api/auth/guest', {
      method: 'POST', body: '{invalid', headers: { 'content-type': 'application/json' },
    }), env, database);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Invalid JSON body' });
    expect(database.createGuest).not.toHaveBeenCalled();
  });
});
