import { PlayerProvider } from './features/auth/PlayerContext';
import { AppRouter } from './routes/AppRouter';
import { SocketProvider } from './shared/contexts/SocketContext';

function App() {
  return (
    <PlayerProvider>
      <SocketProvider>
        <AppRouter />
      </SocketProvider>
    </PlayerProvider>
  );
}

export default App;
