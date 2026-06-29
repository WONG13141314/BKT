// Socket.IO server configuration options

import { env } from './env';

export const socketOptions = {
  cors: {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'] as any,
};
