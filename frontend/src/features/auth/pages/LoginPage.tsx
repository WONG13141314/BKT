import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { UserPlus, ArrowRight, DoorOpen, Hash, ArrowLeft, Loader2, Dices } from 'lucide-react';
import './LoginPage.css';

export function LoginPage() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'name' | 'choice'>('name');
  const navigate = useNavigate();
  const { connectSocket, disconnectSocket } = useSocket();

  // Clear previous session when visiting the login page
  React.useEffect(() => {
    localStorage.removeItem('token');
    disconnectSocket();
  }, [disconnectSocket]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    setError('');
    setStep('choice');
  };

  const doAuth = async (): Promise<boolean> => {
    setIsLoading(true);
    setError('');
    try {
      await authService.joinGame({ name: name.trim() });
      connectSocket();
      // Small delay to let socket connect
      await new Promise(resolve => setTimeout(resolve, 300));
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate.');
      setIsLoading(false);
      return false;
    }
  };

  const handleHost = async () => {
    const ok = await doAuth();
    if (ok) {
      navigate('/lobby?action=host');
    }
  };

  const handleJoin = async () => {
    if (roomCode.trim().length < 4) {
      setError('Please enter a valid room code.');
      return;
    }
    const ok = await doAuth();
    if (ok) {
      navigate(`/lobby?action=join&code=${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-pattern" aria-hidden="true" />
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Dices size={32} strokeWidth={1.5} />
          </div>
          <h1 className="heading-display login-title">Math Monopoly</h1>
          <p className="login-subtitle">Learn math through an exciting board game</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {step === 'name' && (
          <form onSubmit={handleNameSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="name">
                <UserPlus size={14} />
                Your Nickname
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MathWizard123"
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary btn-full">
              Continue
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {step === 'choice' && (
          <div className="choice-panel">
            <p className="choice-greeting">
              Welcome, <strong>{name}</strong>
            </p>
            
            <button
              className="btn-host btn-full"
              onClick={handleHost}
              disabled={isLoading}
            >
              <span className="btn-icon-wrap">
                <DoorOpen size={20} />
              </span>
              <span className="btn-text">
                <strong>Host a Game</strong>
                <small>Create a room &amp; invite friends</small>
              </span>
              {isLoading && <Loader2 size={16} className="icon-spin" />}
            </button>

            <div className="divider">
              <span>OR</span>
            </div>

            <div className="join-section">
              <div className="input-group">
                <label htmlFor="roomCode">
                  <Hash size={14} />
                  Room Code
                </label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="code-input"
                />
              </div>
              <button
                className="btn-join btn-full"
                onClick={handleJoin}
                disabled={isLoading}
              >
                <span className="btn-icon-wrap">
                  <ArrowRight size={20} />
                </span>
                <span className="btn-text">
                  <strong>Join Game</strong>
                  <small>Enter with a room code</small>
                </span>
                {isLoading && <Loader2 size={16} className="icon-spin" />}
              </button>
            </div>

            <button
              className="btn-back"
              onClick={() => { setStep('name'); setError(''); }}
            >
              <ArrowLeft size={14} />
              Change name
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
