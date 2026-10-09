import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthResult, PublicPlayer } from '../features/auth/auth.service';
import type { ClaimInput, GuestInput, SignInInput } from '../features/auth/auth.validation';
import { CloudflareDatabase, type DatabasePlayer } from './database';
import type { WorkerEnv } from './types';

export type AuthDatabase = Pick<CloudflareDatabase,
  'findPlayerById' | 'findPlayerByUsername' | 'createGuest' | 'touchPlayer' |
  'claimPlayer' | 'updateProfile'>;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toPublicPlayer(player: DatabasePlayer): PublicPlayer {
  return {
    id: player.id, displayName: player.displayName, avatar: player.avatar,
    role: player.role, isClaimed: player.isClaimed, username: player.username,
  };
}

function existingPlayer(player: DatabasePlayer | null): DatabasePlayer {
  if (!player) throw new ApiError('Profile no longer exists', 401);
  return player;
}

function issueToken(playerId: string, env: WorkerEnv): string {
  return jwt.sign({ playerId }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: (env.JWT_EXPIRES_IN ?? '90d') as jwt.SignOptions['expiresIn'],
  });
}

export function readBearerToken(authorization: string | null): string | null {
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

/** Verifies the same HS256 playerId tokens already issued by the Render backend. */
export async function authenticateToken(
  token: string | null | undefined, env: WorkerEnv,
  database: AuthDatabase = new CloudflareDatabase(env.DATABASE_URL),
): Promise<PublicPlayer> {
  if (!token) throw new ApiError('Authentication required', 401);
  let playerId: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.playerId !== 'string' || !payload.playerId) {
      throw new Error('Missing player identity');
    }
    playerId = payload.playerId;
  } catch {
    throw new ApiError('Authentication required', 401);
  }
  return toPublicPlayer(existingPlayer(await database.findPlayerById(playerId)));
}

/** Executed inside ApiDO so the unchanged bcrypt cost 10 has the DO CPU allowance. */
export function createAuthService(
  env: WorkerEnv, database: AuthDatabase = new CloudflareDatabase(env.DATABASE_URL),
) {
  return {
    async createGuest(data: GuestInput): Promise<AuthResult> {
      const player = await database.createGuest(data.displayName, data.avatar);
      return { player: toPublicPlayer(player), token: issueToken(player.id, env) };
    },
    async refresh(playerId: string): Promise<AuthResult> {
      const player = existingPlayer(await database.touchPlayer(playerId));
      return { player: toPublicPlayer(player), token: issueToken(player.id, env) };
    },
    async claim(playerId: string, data: ClaimInput): Promise<PublicPlayer> {
      const existing = await database.findPlayerByUsername(data.username);
      if (existing && existing.id !== playerId) {
        throw new ApiError('That username is already taken', 409);
      }
      const pinHash = await bcrypt.hash(data.pin, 10);
      try {
        return toPublicPlayer(existingPlayer(
          await database.claimPlayer(playerId, data.username, pinHash),
        ));
      } catch (error) {
        // A second claimant can win the unique constraint while bcrypt is running.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          throw new ApiError('That username is already taken', 409);
        }
        throw error;
      }
    },
    async signIn(data: SignInInput): Promise<AuthResult> {
      const player = await database.findPlayerByUsername(data.username);
      if (!player?.pinHash || !(await bcrypt.compare(data.pin, player.pinHash))) {
        throw new ApiError('Wrong username or PIN', 401);
      }
      const updated = existingPlayer(await database.touchPlayer(player.id));
      return { player: toPublicPlayer(updated), token: issueToken(updated.id, env) };
    },
    async updateProfile(
      playerId: string, data: { displayName?: string; avatar?: string },
    ): Promise<PublicPlayer> {
      return toPublicPlayer(existingPlayer(await database.updateProfile(playerId, data)));
    },
  };
}
