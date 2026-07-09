import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { corsOptions } from './config/cors';

import { authRoutes } from './features/auth/auth.routes';
import { userRoutes } from './features/users/user.routes';
import gameRoutes from './features/game/game.routes';

export const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: env.NODE_ENV });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: env.NODE_ENV === 'development' ? err.message : undefined,
  });
});
