import { Router } from 'express';
import { authController } from './auth.controller';

export const authRoutes = Router();

authRoutes.post('/join', authController.join);
