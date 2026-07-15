// Socket.IO server configuration options

import { env } from './env';

// Support comma-separated origins (matches cors.ts config)
const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());

export const socketOptions = {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'] as any,
};
