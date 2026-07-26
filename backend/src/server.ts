// Entry point for the server
import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { initializeSocket } from './sockets';
import { warmPersistence } from './features/game/game.persistence';

const server = http.createServer(app);
initializeSocket(server);

server.listen(env.PORT, () => {
  console.log(`🚀 Server running on port ${env.PORT}`);

  // Reports a missing seed at boot rather than silently on the first answer.
  // Deliberately not awaited: a sleeping database must not stop the server
  // from accepting traffic.
  void warmPersistence();
});
