// Bearer-token guard. Attaches the authenticated player to the request.

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { authService, PublicPlayer, toPublicPlayer } from '../../features/auth/auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      player?: PublicPlayer;
    }
  }
}

/** Extract and verify the player id from an Authorization header, or null. */
export function readPlayerId(authorization?: string): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const decoded = jwt.verify(authorization.slice(7), env.JWT_SECRET as string) as {
      playerId?: string;
    };
    return decoded.playerId ?? null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const playerId = readPlayerId(req.headers.authorization);
  if (!playerId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const player = await authService.findById(playerId);
  if (!player) {
    // The token is valid but the profile is gone (e.g. database reset).
    return res.status(401).json({ message: 'Profile no longer exists' });
  }

  req.player = toPublicPlayer(player);
  next();
}
