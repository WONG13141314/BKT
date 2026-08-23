import { PlayerProvider } from './features/auth/PlayerContext';
import { AppRouter } from './routes/AppRouter';
import { SocketProvider } from './shared/contexts/SocketContext';
import { AudioProvider } from './shared/audio/AudioContext';
import { AudioControl } from './shared/audio/AudioControl';

function App() {
  return (
    <AudioProvider>
      <PlayerProvider>
        <SocketProvider>
          <AppRouter />
          <AudioControl />
        </SocketProvider>
      </PlayerProvider>
    </AudioProvider>
  );
}

export default App;
