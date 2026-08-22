// Socket.IO server configuration options

import { env } from './env';
import { getAllowedOrigins } from './origins';

// Support comma-separated origins (matches cors.ts config)
const allowedOrigins = getAllowedOrigins(env.CORS_ORIGIN, env.NODE_ENV);

export const socketOptions = {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'] as any,
};
