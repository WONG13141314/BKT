import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { socketOptions } from '../config/socket';

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authService, toPublicPlayer } from '../features/auth/auth.service';
import { registerLobbyHandlers } from './lobby.handlers';
import { registerGameHandlers } from './game.handlers';

export const initializeSocket = (server: HttpServer) => {
  const io = new Server(server, socketOptions);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));

      const decoded = jwt.verify(token, env.JWT_SECRET as string) as { playerId?: string };
      if (!decoded.playerId) return next(new Error('Authentication error'));

      const player = await authService.findById(decoded.playerId);
      if (!player) return next(new Error('Profile no longer exists'));

      socket.data.player = toPublicPlayer(player);
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id} (${socket.data.player.displayName})`);

    // Register handlers
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};
