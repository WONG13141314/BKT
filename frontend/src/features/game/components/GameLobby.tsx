import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { Copy, Check, Crown, UserCheck, Clock, Gamepad2, LogOut, AlertCircle, Users } from 'lucide-react';
import './GameLobby.css';

interface LobbyPlayer {
  id: string;
  name: string;
  isReady: boolean;
  avatar: string;
}

interface RoomState {
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  status: string;
}

export function GameLobby() {
  const { socket, isConnected, connectSocket } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const action = searchParams.get('action'); // 'host' or 'join'
  const codeParam = searchParams.get('code');

  // Parse our own user ID from the JWT
  const getMyUserId = useCallback(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId;
    } catch {
      return null;
    }
  }, []);

  const myId = getMyUserId();
  const isHost = myId === room?.hostId;

  // Connect socket and perform action
  useEffect(() => {
    // If we have no socket at all, initiate connection and wait
    if (!socket) {
      connectSocket();
      return;
    }

    // Socket exists but still connecting — just wait for it
    if (!isConnected) return;

    if (hasJoined) return; // Don't re-emit after reconnect

    if (action === 'host') {
      socket.emit('room:create');
      setHasJoined(true);
    } else if (action === 'join' && codeParam) {
      socket.emit('room:join', { code: codeParam });
      setHasJoined(true);
    }
  }, [socket, isConnected, action, codeParam, connectSocket, hasJoined]);

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    const onRoomUpdate = (data: RoomState) => {
      setRoom(data);
      setError(null);
    };

    const onRoomError = (data: { message: string }) => {
      setError(data.message);
    };

    const onGameStart = (data: { roomCode: string; players: LobbyPlayer[] }) => {
      navigate(`/game?code=${data.roomCode}`);
    };

    const onRoomDeleted = () => {
      setRoom(null);
      setError('The room has been closed.');
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('room:error', onRoomError);
    socket.on('game:start', onGameStart);
    socket.on('room:deleted', onRoomDeleted);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('room:error', onRoomError);
      socket.off('game:start', onGameStart);
      socket.off('room:deleted', onRoomDeleted);
    };
  }, [socket, navigate]);

  const toggleReady = () => {
    if (socket) socket.emit('room:ready');
  };

  const startGame = () => {
    if (socket) socket.emit('room:start');
  };

  const leaveRoom = () => {
    if (socket) socket.emit('room:leave');
    navigate('/join');
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a hidden input
    }
  };

  const allReady = room
    ? room.players.length >= 2 && room.players.length <= 4 && room.players.every(p => p.isReady)
    : false;

  // If there's no room state yet and no error, show loading
  if (!room && !error) {
    return (
      <div className="lobby-container">
        <div className="lobby-card surface-2">
          <div className="lobby-loading">
            <div className="spinner"></div>
            <p>{action === 'host' ? 'Creating room...' : 'Joining room...'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state (e.g., bad room code)
  if (!room && error) {
    return (
      <div className="lobby-container">
        <div className="lobby-card surface-2">
          <div className="lobby-error-state">
            <AlertCircle size={40} className="error-icon" />
            <p className="error-message">{error}</p>
            <button className="btn-primary" onClick={() => navigate('/join')}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card surface-2">
        {/* Header with room code */}
        <div className="lobby-header">
          <h1 className="heading-display lobby-title">Waiting Room</h1>
          <div className="room-code-display">
            <span className="room-code-label">Room Code</span>
            <div className="room-code-box" onClick={copyCode} title="Click to copy">
              <span className="room-code-value">{room!.code}</span>
              <span className="copy-icon-btn">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </span>
            </div>
            <span className="room-code-hint">Share this code with your friends</span>
          </div>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {/* Player count */}
        <div className="player-count">
          <Users size={14} />
          <span>{room!.players.length}</span> / <span>{room!.maxPlayers}</span> Players
        </div>

        {/* Player list */}
        <div className="players-grid">
          {room!.players.map(player => (
            <div
              key={player.id}
              className={`player-slot ${player.isReady ? 'ready' : 'not-ready'} ${player.id === myId ? 'is-me' : ''}`}
            >
              <div className="player-avatar">{player.avatar}</div>
              <div className="player-details">
                <span className="player-name">
                  {player.name}
                  {player.id === room!.hostId && (
                    <span className="host-badge"><Crown size={12} /> Host</span>
                  )}
                  {player.id === myId && <span className="you-badge">You</span>}
                </span>
                <span className={`ready-status ${player.isReady ? 'ready' : ''}`}>
                  {player.isReady ? (
                    <><UserCheck size={13} /> Ready</>
                  ) : (
                    <><Clock size={13} /> Not Ready</>
                  )}
                </span>
              </div>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: room!.maxPlayers - room!.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="player-slot empty">
              <div className="player-avatar player-avatar--empty">?</div>
              <div className="player-details">
                <span className="player-name empty-name">Waiting for player...</span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="lobby-actions">
          {isHost ? (
            <button
              className={`btn-start btn-full ${allReady ? '' : 'disabled'}`}
              onClick={startGame}
              disabled={!allReady}
            >
              <Gamepad2 size={18} />
              Start Game
            </button>
          ) : (
            <button className="btn-ready btn-full" onClick={toggleReady}>
              {room!.players.find(p => p.id === myId)?.isReady ? (
                <><Clock size={16} /> Unready</>
              ) : (
                <><UserCheck size={16} /> Ready Up</>
              )}
            </button>
          )}
          <button className="btn-leave" onClick={leaveRoom}>
            <LogOut size={14} />
            Leave Room
          </button>
        </div>

        {/* Start condition hint */}
        {isHost && !allReady && (
          <p className="start-hint">
            {room!.players.length < 2
              ? 'Need at least 2 players to start.'
              : 'Waiting for all players to be ready...'}
          </p>
        )}
      </div>
    </div>
  );
}
