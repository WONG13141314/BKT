import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { GameLobby } from '../features/game/components/GameLobby';
import { Board } from '../features/game/components/Board';
import { TurnIndicator } from '../features/game/components/TurnIndicator';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/join" element={<LoginPage />} />
        <Route path="/lobby" element={<GameLobby />} />
        <Route path="/game" element={
          <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
            <TurnIndicator />
            <Board />
          </div>
        } />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
