// CORS configuration

import { env } from './env';
import { getAllowedOrigins } from './origins';

// Support comma-separated origins for production
// e.g. CORS_ORIGIN="https://monomath.onrender.com,http://localhost:5173"
const allowedOrigins = getAllowedOrigins(env.CORS_ORIGIN, env.NODE_ENV);

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (e.g., server-to-server, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
