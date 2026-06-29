import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { joinGameSchema } from './auth.validation';
import { z } from 'zod';

export const authController = {
  join: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = joinGameSchema.parse(req.body);
      const result = await authService.joinGuest(data);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Validation error', errors: error.issues });
        return;
      }
      next(error);
    }
  }
};
