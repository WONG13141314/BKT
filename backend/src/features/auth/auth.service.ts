// ============================================
// Auth — anonymous-first identity
//
// A player gets a permanent profile the first time they type a nickname; they
// are never asked to sign up. The token is long-lived and reused on every
// return visit, which is what lets BKT carry mastery across sessions.
// Claiming a username + PIN is optional and only moves a profile between devices.
// ============================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Player } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { ClaimInput, GuestInput, SignInInput } from './auth.validation';

const PIN_SALT_ROUNDS = 10;

export interface PublicPlayer {
  id: string;
  displayName: string;
  avatar: string;
  role: string;
  isClaimed: boolean;
  username: string | null;
}

export interface AuthResult {
  player: PublicPlayer;
  token: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Never send `pinHash` to a client. */
export function toPublicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    avatar: player.avatar,
    role: player.role,
    isClaimed: player.isClaimed,
    username: player.username,
  };
}

function issueToken(playerId: string): string {
  return jwt.sign({ playerId }, env.JWT_SECRET as string, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export const authService = {
  /** First visit: mint a permanent profile with no signup step. */
  createGuest: async (data: GuestInput): Promise<AuthResult> => {
    const player = await prisma.player.create({
      data: { displayName: data.displayName, avatar: data.avatar },
    });

    return { player: toPublicPlayer(player), token: issueToken(player.id) };
  },

  /**
   * Return visit: the client presents its stored token and gets the same
   * profile back. This is the step that used to be missing — the old flow
   * discarded the token and created a brand-new user on every page load.
   */
  refresh: async (playerId: string): Promise<AuthResult> => {
    const player = await prisma.player.update({
      where: { id: playerId },
      data: { lastSeenAt: new Date() },
    });

    return { player: toPublicPlayer(player), token: issueToken(player.id) };
  },

  /** Opt in to a username + PIN so the profile can be used on another device. */
  claim: async (playerId: string, data: ClaimInput): Promise<PublicPlayer> => {
    const existing = await prisma.player.findUnique({
      where: { username: data.username },
    });
    if (existing && existing.id !== playerId) {
      throw new AuthError('That username is already taken', 409);
    }

    const player = await prisma.player.update({
      where: { id: playerId },
      data: {
        username: data.username,
        pinHash: await bcrypt.hash(data.pin, PIN_SALT_ROUNDS),
        isClaimed: true,
      },
    });

    return toPublicPlayer(player);
  },

  /** Sign in to a claimed profile from a device that has never seen it. */
  signIn: async (data: SignInInput): Promise<AuthResult> => {
    const player = await prisma.player.findUnique({
      where: { username: data.username },
    });

    // Same message either way, so a wrong username cannot be distinguished
    // from a wrong PIN.
    if (!player?.pinHash || !(await bcrypt.compare(data.pin, player.pinHash))) {
      throw new AuthError('Wrong username or PIN', 401);
    }

    const updated = await prisma.player.update({
      where: { id: player.id },
      data: { lastSeenAt: new Date() },
    });

    return { player: toPublicPlayer(updated), token: issueToken(updated.id) };
  },

  /** Change nickname or token without losing any progress. */
  updateProfile: async (
    playerId: string,
    data: { displayName?: string; avatar?: string }
  ): Promise<PublicPlayer> => {
    const player = await prisma.player.update({ where: { id: playerId }, data });
    return toPublicPlayer(player);
  },

  findById: async (playerId: string): Promise<Player | null> => {
    return prisma.player.findUnique({ where: { id: playerId } });
  },
};
