import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { StoredProfile } from '../../auth/types/auth.types';
import type { ConnectionNotice } from '../hooks/useConnectionNotice';
import type { Player } from '../types/game.types';
import { DelayedFallback } from './BoardRendering';

/** A full-page message in place of the board. */
function GameMessage({ card = false, children }: { card?: boolean; children: ReactNode }) {
  return (
    <div className="game-page game-page--center">
      <div className={`game-page__message${card ? ' seat-recovery-card' : ''}`}>{children}</div>
    </div>
  );
}

export function MissingRoomScreen({ onBack }: { onBack: () => void }) {
  return (
    <GameMessage>
      <AlertCircle size={24} />
      <h2>No Game Room specified.</h2>
      <button className="action-btn action-btn--primary" onClick={onBack}>Go Back</button>
    </GameMessage>
  );
}

export function FatalGameScreen({ message, onExit }: { message: string; onExit: () => void }) {
  return (
    <GameMessage card>
      <AlertCircle size={30} />
      <h2>{message}</h2>
      <button className="action-btn action-btn--primary" onClick={onExit}>
        Return to Player Select
      </button>
    </GameMessage>
  );
}

export function SeatRecoveryScreen({ message, choices, recovering, onChoose, onExit }: {
  message: string;
  choices: StoredProfile[];
  recovering: boolean;
  onChoose: (profile: StoredProfile) => void;
  onExit: () => void;
}) {
  return (
    <GameMessage card>
      {recovering && <Loader2 size={28} className="icon-spin" />}
      <h2>{message}</h2>
      {choices.map((profile) => (
        <button key={profile.id} className="action-btn action-btn--primary" onClick={() => onChoose(profile)}>
          Continue as {profile.displayName}
        </button>
      ))}
      {choices.length === 0 && !recovering && (
        <button className="action-btn action-btn--secondary" onClick={onExit}>
          Return to Player Select
        </button>
      )}
    </GameMessage>
  );
}

/** Usually a moment; a message appears only if the game is slow to arrive. */
export function LoadingGameScreen() {
  return (
    <div className="game-page game-page--center">
      <DelayedFallback delayMs={2000}>
        <div className="game-page__message">
          <Loader2 size={28} className="icon-spin" />
          <h2>Loading Game...</h2>
        </div>
      </DelayedFallback>
    </div>
  );
}

/** Opening: who goes first, while the table gets ready. */
export function OpeningBanner({ firstPlayer, isMe, waiting }: { firstPlayer: Player; isMe: boolean; waiting: boolean }) {
  return (
    <div className="game-opening" role="status" aria-live="polite">
      <div className="game-opening__card">
        <span className="game-opening__round">Round 1</span>
        <h2>{isMe ? 'You go first' : `${firstPlayer.name} goes first`}</h2>
        {waiting && <p>Waiting for everyone's board…</p>}
      </div>
    </div>
  );
}

/** A brief drop shows a small tag; a lasting one covers the table. */
export function ReconnectNotice({ notice }: { notice: ConnectionNotice }) {
  if (notice === 'tag') {
    return (
      <div className="game-reconnecting-tag" role="status" aria-live="polite">
        <Loader2 size={14} className="icon-spin" aria-hidden="true" />
        Reconnecting…
      </div>
    );
  }
  if (notice !== 'panel') return null;
  return (
    <div className="game-reconnecting-overlay" role="status" aria-live="polite">
      <div className="game-reconnecting-card">
        <Loader2 size={26} className="icon-spin" aria-hidden="true" />
        <h2>Reconnecting…</h2>
        <p>Your game will refresh when the connection returns.</p>
      </div>
    </div>
  );
}

/** Shown if an active question has not arrived yet. */
export function ChallengeLoading({ onFetch }: { onFetch: () => void }) {
  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <Loader2 size={32} className="icon-spin" style={{ margin: '0 auto 16px' }} />
      <h3 style={{ margin: '8px 0', fontSize: '1.25rem' }}>Loading Question...</h3>
      <p style={{ color: '#6b7280', margin: '4px 0 16px', fontSize: '0.9rem' }}>
        Fetching your challenge from the server.
      </p>
      <button className="action-btn action-btn--primary" onClick={onFetch} style={{ margin: '0 auto' }}>
        Fetch Question
      </button>
    </div>
  );
}
