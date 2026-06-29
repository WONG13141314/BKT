import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { socketOptions } from '../config/socket';

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { registerLobbyHandlers } from './lobby.handlers';

export const initializeSocket = (server: HttpServer) => {
  const io = new Server(server, socketOptions);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));

      const decoded = jwt.verify(token, env.JWT_SECRET as string) as { userId: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

      if (!user) return next(new Error('User not found'));

      // Attach user to socket data
      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id} (User: ${socket.data.user.name})`);

    // Register handlers
    registerLobbyHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return io;
};
