import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/require-auth';
import { authController } from './auth.controller';

export const authRoutes = Router();

// Public
authRoutes.post('/guest', authController.guest);
authRoutes.post('/signin', authController.signIn);

// Requires a valid token
authRoutes.post('/refresh', requireAuth, authController.refresh);
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.patch('/me', requireAuth, authController.updateProfile);
authRoutes.post('/claim', requireAuth, authController.claim);
