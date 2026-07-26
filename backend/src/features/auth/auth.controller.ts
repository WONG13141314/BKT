import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AuthError, authService } from './auth.service';
import {
  AVATARS,
  claimSchema,
  displayNameSchema,
  guestSchema,
  signInSchema,
} from './auth.validation';

function handle(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      message: error.issues[0]?.message ?? 'Validation error',
      errors: error.issues,
    });
  }
  if (error instanceof AuthError) {
    return res.status(error.status).json({ message: error.message });
  }
  return next(error);
}

const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatar: z.enum(AVATARS).optional(),
});

export const authController = {
  /** POST /api/auth/guest — first visit, no signup step */
  guest: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await authService.createGuest(guestSchema.parse(req.body)));
    } catch (error) {
      handle(error, res, next);
    }
  },

  /** POST /api/auth/refresh — return visit, same profile */
  refresh: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await authService.refresh(req.player!.id));
    } catch (error) {
      handle(error, res, next);
    }
  },

  /** GET /api/auth/me */
  me: async (req: Request, res: Response) => {
    res.json({ player: req.player });
  },

  /** PATCH /api/auth/me — rename or restyle without losing progress */
  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const player = await authService.updateProfile(
        req.player!.id,
        updateProfileSchema.parse(req.body)
      );
      res.json({ player });
    } catch (error) {
      handle(error, res, next);
    }
  },

  /** POST /api/auth/claim — opt in to cross-device sign-in */
  claim: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const player = await authService.claim(req.player!.id, claimSchema.parse(req.body));
      res.json({ player });
    } catch (error) {
      handle(error, res, next);
    }
  },

  /** POST /api/auth/signin — restore a claimed profile on a new device */
  signIn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await authService.signIn(signInSchema.parse(req.body)));
    } catch (error) {
      handle(error, res, next);
    }
  },
};
