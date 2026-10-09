import type { PublicPlayer } from '../features/auth/auth.service';

export interface WorkerEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  CORS_ORIGIN?: string;
  ROOMS: DurableObjectNamespace;
  API: DurableObjectNamespace;
  PLAYERS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export interface ClientFrame {
  event: string;
  data?: unknown;
  id?: string;
  actionId?: string;
}

export interface ConnectionAttachment {
  id: string;
  player: PublicPlayer;
  rooms: string[];
  gameId?: string;
  expiresAt: number;
  closed?: boolean;
}
