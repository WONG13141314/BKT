import jwt from 'jsonwebtoken';
import { authenticateToken, type AuthDatabase, type ProfileCache } from '../auth';
import type { PublicPlayer } from '../../features/auth/auth.types';
import type { WorkerEnv } from '../types';

const env = { JWT_SECRET: 'synthetic-secret-for-profile-cache' } as WorkerEnv;
const row = {
  id: 'player-1', displayName: 'Aina', avatar: 'car', role: 'PLAYER',
  isClaimed: false, username: null, pinHash: null,
};

function memoryCache(): ProfileCache & { entries: Map<string, PublicPlayer> } {
  const entries = new Map<string, PublicPlayer>();
  return { entries, get: async (id) => entries.get(id), set: async (player) => { entries.set(player.id, player); } };
}

describe('socket authentication with a room profile cache', () => {
  it('looks a learner up once, then reuses the profile while still checking the token', async () => {
    const database = { findPlayerById: jest.fn(async () => row) } as unknown as AuthDatabase;
    const cache = memoryCache();
    const token = jwt.sign({ playerId: 'player-1' }, env.JWT_SECRET);

    await expect(authenticateToken(token, env, database, cache)).resolves.toMatchObject({ displayName: 'Aina' });
    await expect(authenticateToken(token, env, database, cache)).resolves.toMatchObject({ displayName: 'Aina' });
    expect(database.findPlayerById).toHaveBeenCalledTimes(1);

    const forged = jwt.sign({ playerId: 'player-1' }, 'another-secret');
    await expect(authenticateToken(forged, env, database, cache)).rejects.toMatchObject({ status: 401 });
  });

  it('still rejects a missing profile and caches nothing for it', async () => {
    const database = { findPlayerById: jest.fn(async () => null) } as unknown as AuthDatabase;
    const cache = memoryCache();
    const token = jwt.sign({ playerId: 'gone' }, env.JWT_SECRET);
    await expect(authenticateToken(token, env, database, cache)).rejects.toMatchObject({ status: 401 });
    expect(cache.entries.size).toBe(0);
  });
});
