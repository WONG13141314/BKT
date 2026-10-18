import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { avatarToken } from '../../auth/avatars';
import { usePlayer } from '../../auth/PlayerContext';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { Copy, Check, Crown, UserCheck, Clock, Gamepad2, LogOut, AlertCircle, Users, Bot, Trash2 } from 'lucide-react';
import { useAudio, useAudioScene } from '../../../shared/audio/AudioContext';
import { preloadBoardScenes } from './board.preload';
import './GameLobby.css';

interface LobbyPlayer {
  id: string;
  name: string;
  isReady: boolean;
  avatar: string;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

interface RoomState {
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  status: string;
}

function lobbySeatStorageKey(playerId: string): string {
  return `mm.lobby-seat.${playerId}`;
}

export function GameLobby() {
  const { socket, isConnected, connectSocket } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const bootstrapRef = useRef<string | null>(null);
  const terminalRecoveryRef = useRef(false);
  const previousRoomRef = useRef<RoomState | null>(null);
  const { play } = useAudio();
  useAudioScene('lobby');

  const action = searchParams.get('action');
  const codeParam = searchParams.get('code');

  const { player } = usePlayer();
  const myId = player?.id ?? null;

  // Download the 3D dice and tokens while players wait, so the board opens in 3D.
  useEffect(() => { preloadBoardScenes(); }, []);

  useEffect(() => {
    if (terminalRecoveryRef.current) return;
    const savedRoomCode = myId ? sessionStorage.getItem(lobbySeatStorageKey(myId)) : null;
    if (!socket) {
      connectSocket(savedRoomCode ?? (action === 'join' ? codeParam : null));
      return;
    }
    if (!isConnected) return;

    const bootstrapKey = savedRoomCode
      ? `resume:${socket.id ?? 'connected'}:${savedRoomCode}`
      : `fresh:${socket.id ?? 'connected'}:${action ?? ''}:${codeParam ?? ''}`;
    if (bootstrapRef.current === bootstrapKey) return;

    if (savedRoomCode) {
      bootstrapRef.current = bootstrapKey;
      socket.emit('room:resume', { code: savedRoomCode });
    } else if (action === 'host') {
      bootstrapRef.current = bootstrapKey;
      socket.emit('room:create');
    } else if (action === 'join' && codeParam) {
      bootstrapRef.current = bootstrapKey;
      socket.emit('room:join', { code: codeParam });
    }
  }, [socket, isConnected, action, codeParam, connectSocket, myId]);

  useEffect(() => {
    if (!socket) return;

    const onRoomUpdate = (data: RoomState) => {
      const previous = previousRoomRef.current;
      if (previous) {
        if (data.players.length > previous.players.length) play('playerJoin');
        else if (data.players.some((seat) => seat.isReady
          && !previous.players.find((oldSeat) => oldSeat.id === seat.id)?.isReady)) {
          play('ready');
        }
      }
      previousRoomRef.current = data;
      setRoom(data);
      setError(null);
      if (myId && data.players.some((seat) => seat.id === myId)) {
        sessionStorage.setItem(`mm.game-seat.${data.code}`, myId);
        sessionStorage.setItem(lobbySeatStorageKey(myId), data.code);
      }
    };
    const onRoomError = (data: { message: string }) => setError(data.message);
    const onGameStart = (data: { roomCode: string }) => {
      if (myId) sessionStorage.removeItem(lobbySeatStorageKey(myId));
      play('gameStart');
      navigate(`/game?code=${data.roomCode}`);
    };
    const onRoomDeleted = () => {
      if (myId) sessionStorage.removeItem(lobbySeatStorageKey(myId));
      terminalRecoveryRef.current = true;
      bootstrapRef.current = null;
      setRoom(null);
      setError('The room has been closed.');
    };
    const onRoomRemoved = (data: { code: string; message: string }) => {
      if (myId) sessionStorage.removeItem(lobbySeatStorageKey(myId));
      terminalRecoveryRef.current = true;
      bootstrapRef.current = null;
      setRoom(null);
      setError(data.message);
    };
    const resumeRoom = () => {
      if (terminalRecoveryRef.current) return;
      const code = myId ? sessionStorage.getItem(lobbySeatStorageKey(myId)) : null;
      if (!code) return;
      const bootstrapKey = `resume:${socket.id ?? 'connected'}:${code}`;
      if (bootstrapRef.current === bootstrapKey) return;
      bootstrapRef.current = bootstrapKey;
      socket.emit('room:resume', { code });
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('room:error', onRoomError);
    socket.on('game:start', onGameStart);
    socket.on('room:deleted', onRoomDeleted);
    socket.on('room:removed', onRoomRemoved);
    socket.on('connect', resumeRoom);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('room:error', onRoomError);
      socket.off('game:start', onGameStart);
      socket.off('room:deleted', onRoomDeleted);
      socket.off('room:removed', onRoomRemoved);
      socket.off('connect', resumeRoom);
    };
  }, [socket, navigate, myId, play]);

  const toggleReady = () => { if (socket) socket.emit('room:ready'); };
  const startGame = () => { if (socket) socket.emit('room:start'); };
  const returnToLanding = () => {
    terminalRecoveryRef.current = false;
    bootstrapRef.current = null;
    if (myId) sessionStorage.removeItem(lobbySeatStorageKey(myId));
    navigate('/', { replace: true });
  };
  const leaveRoom = () => {
    if (socket) socket.emit('room:leave');
    returnToLanding();
  };

  const addBot = () => {
    if (socket) socket.emit('room:add-bot', { difficulty: botDifficulty });
  };

  const removeBot = (botId: string) => {
    if (socket) socket.emit('room:remove-bot', { botId });
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  // Hosting shows the waiting room at once with the host seated; the code and
  // controls fill in when the server confirms the room a moment later.
  const creating = !room && !error && action === 'host' && !!player
    && !sessionStorage.getItem(lobbySeatStorageKey(player.id));
  const shownRoom: RoomState | null = room ?? (creating && player ? {
    code: '', hostId: player.id, maxPlayers: 4, status: 'waiting',
    players: [{ id: player.id, name: player.displayName, avatar: player.avatar, isReady: true, isBot: false }],
  } : null);
  const isHost = myId !== null && myId === shownRoom?.hostId;

  const humanPlayers = room ? room.players.filter(p => !p.isBot) : [];
  const allHumansReady = humanPlayers.length >= 1 && humanPlayers.every(p => p.isReady);
  const canStart = room ? room.players.length >= 2 && allHumansReady : false;

  if (!shownRoom && !error) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <div className="lobby-loading">
            <div className="spinner"></div>
            <p>{action === 'host' ? 'Creating room...' : 'Joining room...'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!shownRoom && error) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <div className="lobby-error-state">
            <AlertCircle size={40} className="error-icon" />
            <p className="error-message">{error}</p>
            <button className="btn-primary" onClick={returnToLanding}>Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        {/* Header */}
        <div className="lobby-header">
          <h1 className="heading-display lobby-title">Waiting Room</h1>
          <div className="room-code-display">
            <span className="room-code-label">Room Code</span>
            <button
              type="button"
              className="room-code-box"
              onClick={copyCode}
              disabled={!room}
              aria-label={room ? `Copy room code ${room.code}` : 'Creating room code'}
            >
              <span className="room-code-value">{room ? room.code : '······'}</span>
              <span className="copy-icon-btn">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </span>
            </button>
            <span className="room-code-hint" role="status">
              {!room ? 'Creating your room…' : copied ? 'Copied to clipboard' : 'Share this code with your friends'}
            </span>
          </div>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {/* Player count */}
        <div className="player-count">
          <Users size={14} />
          <span>{shownRoom!.players.length}</span> / <span>{shownRoom!.maxPlayers}</span> Players
        </div>

        {/* Player list */}
        <div className="players-grid">
          {shownRoom!.players.map(player => (
            <div
              key={player.id}
              className={`player-slot ${player.isReady ? 'ready' : 'not-ready'} ${player.id === myId ? 'is-me' : ''} ${player.isBot ? 'is-bot' : ''}`}
            >
              <div className="player-avatar">{avatarToken(player.avatar)}</div>
              <div className="player-details">
                <span className="player-name">
                  {player.name}
                  {player.id === shownRoom!.hostId && (
                    <span className="host-badge"><Crown size={12} /> Host</span>
                  )}
                  {player.id === myId && <span className="you-badge">You</span>}
                  {player.isBot && (
                    <span className="bot-difficulty-badge">
                      {player.botDifficulty ?? 'medium'}
                    </span>
                  )}
                </span>
                <span className={`ready-status ${player.isReady ? 'ready' : ''}`}>
                  {player.isReady ? (
                    <><UserCheck size={13} /> Ready</>
                  ) : (
                    <><Clock size={13} /> Not Ready</>
                  )}
                </span>
              </div>
              {/* Host can remove bots */}
              {isHost && player.isBot && (
                <button
                  type="button"
                  className="remove-bot-btn"
                  onClick={() => removeBot(player.id)}
                  aria-label={`Remove ${player.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: shownRoom!.maxPlayers - shownRoom!.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="player-slot empty">
              <div className="player-avatar player-avatar--empty">?</div>
              <div className="player-details">
                <span className="player-name empty-name">Waiting for player...</span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Bot Section (Host only) */}
        {isHost && shownRoom!.players.length < shownRoom!.maxPlayers && (
          <div className="add-bot-section">
            <div className="add-bot-controls">
              <select
                className="bot-difficulty-select"
                value={botDifficulty}
                onChange={(e) => setBotDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              >
                <option value="easy">Easy Bot</option>
                <option value="medium">Medium Bot</option>
                <option value="hard">Hard Bot</option>
              </select>
              <button className="btn-add-bot" onClick={addBot} disabled={!room}>
                <Bot size={16} />
                Add Bot
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="lobby-actions">
          {isHost ? (
            <button
              className={`btn-start btn-full ${canStart ? '' : 'disabled'}`}
              onClick={startGame}
              disabled={!canStart}
            >
              <Gamepad2 size={18} />
              Start Game
            </button>
          ) : (
            <button className="btn-ready btn-full" onClick={toggleReady}>
              {shownRoom!.players.find(p => p.id === myId)?.isReady ? (
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
        {isHost && !canStart && (
          <p className="start-hint">
            {shownRoom!.players.length < 2
              ? 'Need at least 2 players (human or bot) to start.'
              : 'Waiting for all human players to be ready...'}
          </p>
        )}
      </div>
    </div>
  );
}
