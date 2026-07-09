import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { GameLobby } from '../features/game/components/GameLobby';
import { GamePage } from '../features/game/pages/GamePage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/join" element={<LoginPage />} />
        <Route path="/lobby" element={<GameLobby />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

