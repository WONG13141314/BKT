import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePlayer } from '../features/auth/PlayerContext';
import { LoginPage } from '../features/auth/pages/LoginPage';

const GameLobby = lazy(() => import('../features/game/components/GameLobby')
  .then((module) => ({ default: module.GameLobby })));
const GamePage = lazy(() => import('../features/game/pages/GamePage')
  .then((module) => ({ default: module.GamePage })));

/** Most route loads are instant; the spinner appears only if one is slow. */
function RouteLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <Loader2 size={28} className="icon-spin" aria-hidden="true" />
      <span className="sr-only">Loading game…</span>
    </div>
  );
}

/** Holds a route until the boot-time profile restore settles. */
function RequirePlayer({ children }: { children: ReactNode }) {
  const { player, isRestoring } = usePlayer();

  if (isRestoring) {
    return <RouteLoading />;
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
            <Suspense fallback={<RouteLoading />}>
              <RequirePlayer>
                <GameLobby />
              </RequirePlayer>
            </Suspense>
          }
        />
        <Route
          path="/game"
          element={
            <Suspense fallback={<RouteLoading />}>
              <RequirePlayer>
                <GamePage />
              </RequirePlayer>
            </Suspense>
          }
        />
        {/* Legacy entry point */}
        <Route path="/join" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
