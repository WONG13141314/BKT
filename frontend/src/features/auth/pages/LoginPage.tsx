import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Dices,
  DoorOpen,
  Hash,
  Loader2,
  LogIn,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { AVATARS, Avatar, avatarLabel, avatarToken } from '../avatars';
import { usePlayer } from '../PlayerContext';
import { authService } from '../services/auth.service';
import { StoredProfile } from '../types/auth.types';
import './LoginPage.css';

type Step = 'welcome' | 'newPlayer' | 'switch' | 'signIn' | 'claim';

export function LoginPage() {
  const navigate = useNavigate();
  const { connectSocket } = useSocket();
  const { player, isRestoring, setPlayer } = usePlayer();

  const [step, setStep] = useState<Step>('newPlayer');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>('tophat');
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const profiles = useMemo<StoredProfile[]>(
    () => authService.getStoredProfiles().filter((p) => p.id !== player?.id),
    [player?.id]
  );

  // Once the boot-time restore settles, a known player skips straight to
  // hosting or joining. No re-typing, no signup.
  useEffect(() => {
    if (isRestoring) return;
    setStep(player ? 'welcome' : 'newPlayer');
  }, [isRestoring, player]);

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const run = async (task: () => Promise<void>) => {
    setIsBusy(true);
    clearMessages();
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const created = await authService.createGuest(name.trim(), avatar);
      setPlayer(created);
      setStep('welcome');
    });
  };

  const handleSwitch = (profile: StoredProfile) =>
    void run(async () => {
      const switched = await authService.switchTo(profile);
      if (!switched) throw new Error('That profile has expired. Please sign in again.');
      setPlayer(switched);
      setStep('welcome');
    });

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const signedIn = await authService.signIn(username, pin);
      setPlayer(signedIn);
      setUsername('');
      setPin('');
      setStep('welcome');
    });
  };

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const claimed = await authService.claim(username, pin);
      setPlayer(claimed);
      setUsername('');
      setPin('');
      setStep('welcome');
      setNotice('Progress saved. You can now play on any device.');
    });
  };

  const enterLobby = (target: string) => {
    connectSocket();
    // Give the socket a moment to hand over the token before the lobby mounts.
    window.setTimeout(() => navigate(target), 250);
  };

  const handleHost = () => enterLobby('/lobby?action=host');

  const handleJoin = () => {
    if (roomCode.trim().length < 4) {
      setError('Please enter a valid room code.');
      return;
    }
    enterLobby(`/lobby?action=join&code=${roomCode.trim().toUpperCase()}`);
  };

  // ---- Render ----

  if (isRestoring) {
    return (
      <div className="login-page">
        <div className="login-card login-card--loading">
          <Loader2 size={28} className="icon-spin" />
          <p className="login-subtitle">Loading your token…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Dices size={32} strokeWidth={1.5} />
          </div>
          <h1 className="heading-display login-title">Mathopoly</h1>
          <p className="login-subtitle">Roll, solve, and build your empire</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {notice && <div className="login-notice">{notice}</div>}

        {/* ---- New player: nickname + token ---- */}
        {step === 'newPlayer' && (
          <form onSubmit={handleCreatePlayer} className="login-form">
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
                placeholder="e.g. MathWizard"
                maxLength={16}
                autoFocus
              />
            </div>

            <fieldset className="input-group token-fieldset">
              <legend>
                <Dices size={14} />
                Pick Your Token
              </legend>
              <div className="token-grid" role="radiogroup" aria-label="Pick your token">
                {AVATARS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`token-pick ${avatar === option ? 'token-pick--active' : ''}`}
                    onClick={() => setAvatar(option)}
                    role="radio"
                    aria-checked={avatar === option}
                    aria-label={avatarLabel(option)}
                    title={avatarLabel(option)}
                  >
                    <span aria-hidden="true">{avatarToken(option)}</span>
                    <span className="sr-only">{avatarLabel(option)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <button type="submit" className="btn-primary btn-full" disabled={isBusy}>
              Continue
              {isBusy ? <Loader2 size={16} className="icon-spin" /> : <ArrowRight size={16} />}
            </button>

            {profiles.length > 0 && (
              <button type="button" className="btn-back" onClick={() => setStep('switch')}>
                <Users size={14} />
                Played here before?
              </button>
            )}
            {profiles.length === 0 && (
              <button type="button" className="btn-back" onClick={() => { clearMessages(); setStep('signIn'); }}>
                <LogIn size={14} />
                I have a username
              </button>
            )}
          </form>
        )}

        {/* ---- Known player: host or join ---- */}
        {step === 'welcome' && player && (
          <div className="choice-panel">
            <div className="player-chip">
              <span className="player-chip__token" aria-hidden="true">
                {avatarToken(player.avatar)}
              </span>
              <span className="player-chip__text">
                <small>Welcome back</small>
                <strong>{player.displayName}</strong>
              </span>
            </div>

            <button className="btn-host btn-full" onClick={handleHost} disabled={isBusy}>
              <span className="btn-icon-wrap">
                <DoorOpen size={20} />
              </span>
              <span className="btn-text">
                <strong>Host a Game</strong>
                <small>Create a room &amp; invite friends</small>
              </span>
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
              <button className="btn-join btn-full" onClick={handleJoin} disabled={isBusy}>
                <span className="btn-icon-wrap">
                  <ArrowRight size={20} />
                </span>
                <span className="btn-text">
                  <strong>Join Game</strong>
                  <small>Enter with a room code</small>
                </span>
              </button>
            </div>

            <div className="login-footer">
              <button className="btn-back" onClick={() => { clearMessages(); setStep('switch'); }}>
                <Users size={14} />
                Not {player.displayName}?
              </button>
              {!player.isClaimed && (
                <button className="btn-back" onClick={() => { clearMessages(); setStep('claim'); }}>
                  <ShieldCheck size={14} />
                  Save my progress
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- Shared device: switch profile ---- */}
        {step === 'switch' && (
          <div className="choice-panel">
            <p className="choice-greeting">Who's playing?</p>

            <div className="profile-list">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  className="profile-row"
                  onClick={() => handleSwitch(profile)}
                  disabled={isBusy}
                >
                  <span className="profile-row__token" aria-hidden="true">
                    {avatarToken(profile.avatar)}
                  </span>
                  <span className="profile-row__name">{profile.displayName}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
              {profiles.length === 0 && (
                <p className="profile-empty">No other players saved on this device.</p>
              )}
            </div>

            <button
              className="btn-primary btn-full"
              onClick={() => { clearMessages(); setName(''); setStep('newPlayer'); }}
            >
              <UserPlus size={16} />
              New Player
            </button>

            <button className="btn-back" onClick={() => { clearMessages(); setStep('signIn'); }}>
              <LogIn size={14} />
              Sign in with a username
            </button>
            {player && (
              <button className="btn-back" onClick={() => { clearMessages(); setStep('welcome'); }}>
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>
        )}

        {/* ---- Cross-device sign in ---- */}
        {step === 'signIn' && (
          <form onSubmit={handleSignIn} className="login-form">
            <p className="choice-greeting">Sign in to your saved progress</p>

            <div className="input-group">
              <label htmlFor="username">
                <UserPlus size={14} />
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="e.g. mathwizard"
                maxLength={16}
                autoFocus
              />
            </div>

            <div className="input-group">
              <label htmlFor="pin">
                <ShieldCheck size={14} />
                6-Digit PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                maxLength={6}
                className="code-input"
              />
            </div>

            <button type="submit" className="btn-primary btn-full" disabled={isBusy}>
              Sign In
              {isBusy ? <Loader2 size={16} className="icon-spin" /> : <ArrowRight size={16} />}
            </button>

            <button
              type="button"
              className="btn-back"
              onClick={() => { clearMessages(); setStep(player ? 'welcome' : 'newPlayer'); }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
          </form>
        )}

        {/* ---- Optional upgrade: claim a username + PIN ---- */}
        {step === 'claim' && (
          <form onSubmit={handleClaim} className="login-form">
            <p className="choice-greeting">
              Pick a username and PIN so you can play on another device without
              losing your progress.
            </p>

            <div className="input-group">
              <label htmlFor="claimUsername">
                <UserPlus size={14} />
                Username
              </label>
              <input
                id="claimUsername"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="letters, numbers, underscore"
                maxLength={16}
                autoFocus
              />
            </div>

            <div className="input-group">
              <label htmlFor="claimPin">
                <ShieldCheck size={14} />
                6-Digit PIN
              </label>
              <input
                id="claimPin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                maxLength={6}
                className="code-input"
              />
            </div>

            <button type="submit" className="btn-primary btn-full" disabled={isBusy}>
              Save Progress
              {isBusy ? <Loader2 size={16} className="icon-spin" /> : <ArrowRight size={16} />}
            </button>

            <button
              type="button"
              className="btn-back"
              onClick={() => { clearMessages(); setStep('welcome'); }}
            >
              <ArrowLeft size={14} />
              Maybe later
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
