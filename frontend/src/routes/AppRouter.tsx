import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePlayer } from '../features/auth/PlayerContext';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { GameLobby } from '../features/game/components/GameLobby';
import { GamePage } from '../features/game/pages/GamePage';

/** Holds a route until the boot-time profile restore settles. */
function RequirePlayer({ children }: { children: ReactNode }) {
  const { player, isRestoring } = usePlayer();

  if (isRestoring) {
    return (
      <div className="route-loading">
        <Loader2 size={28} className="icon-spin" />
      </div>
    );
  }

  if (!player) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/lobby"
          element={
            <RequirePlayer>
              <GameLobby />
            </RequirePlayer>
          }
        />
        <Route
          path="/game"
          element={
            <RequirePlayer>
              <GamePage />
            </RequirePlayer>
          }
        />
        {/* Legacy entry point */}
        <Route path="/join" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
