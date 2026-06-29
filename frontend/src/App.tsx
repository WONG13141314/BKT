import { AppRouter } from './routes/AppRouter';
import { SocketProvider } from './shared/contexts/SocketContext';

function App() {
  return (
    <SocketProvider>
      <AppRouter />
    </SocketProvider>
  );
}

export default App;
