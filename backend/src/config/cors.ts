// CORS configuration

import { env } from './env';

export const corsOptions = {
  origin: env.CORS_ORIGIN,
  credentials: true,
};
