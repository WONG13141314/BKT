import { Player, formatRM } from '../types/game.types';
import { Lock, Flame, Building2, CheckCircle2, Star, Shield, Tag } from 'lucide-react';
import { TOKEN_NAMES } from '../config/tokens';
import { TokenIcon } from './TokenIcon';
import './PlayerPanel.css';

interface PlayerPanelProps {
  players: Player[];
  currentPlayerIndex: number;
  myPlayerId: string;
  round: number;
  maxRounds: number;
  /** The clock cap has been reached; the game ends when this lap completes. */
  isFinalRound?: boolean;
}

export function PlayerPanel({
  players,
  currentPlayerIndex,
  myPlayerId,
  round,
  maxRounds,
  isFinalRound = false,
}: PlayerPanelProps) {
  return (
    <aside className="player-panel" aria-label="Players">
      <div className="panel-round">
        <span className="panel-round__label">Round</span>
        <span className="panel-round__value">{round}<small>/{maxRounds}</small></span>
        <div className="panel-round__bar" aria-hidden="true">
          <div className="panel-round__fill" style={{ width: `${(round / maxRounds) * 100}%` }} />
        </div>
        {isFinalRound && (
          <span className="panel-round__final" role="status">Final round — time is up after this lap</span>
        )}
      </div>

      <ol className="panel-players">
        {players.map((player, idx) => {
          const isCurrentTurn = idx === currentPlayerIndex;
          const isMe = player.id === myPlayerId;
          const badges = [
            player.isInJail && <span key="jail" className="badge badge--jail" title="In jail"><Lock size={11} /> Jail</span>,
            player.isBankrupt && <span key="bankrupt" className="badge badge--bankrupt">Bankrupt</span>,
            player.streak >= 3 && <span key="streak" className="badge badge--streak" title="Correct answers in a row"><Flame size={11} /> {player.streak}</span>,
            player.hasLevelUpToken && <span key="token" className="badge badge--token" title="Free house token"><Star size={11} /> Token</span>,
            player.hasRentShield && <span key="shield" className="badge badge--shield" title="Rent shield"><Shield size={11} /> Shield</span>,
            player.hasDiscountToken && <span key="discount" className="badge badge--discount" title="Discount card"><Tag size={11} /> -30%</span>,
          ].filter(Boolean);

          return (
            <li
              key={player.id}
              className={`panel-player${isCurrentTurn ? ' panel-player--active' : ''}${isMe ? ' panel-player--me' : ''}${player.isBankrupt ? ' panel-player--bankrupt' : ''}`}
              style={{ '--player-color': player.color } as React.CSSProperties}
              aria-current={isCurrentTurn ? 'true' : undefined}
            >
              <span className="panel-player__token" title={TOKEN_NAMES[player.tokenType] ?? 'Token'}>
                <TokenIcon token={player.tokenType} size={34} />
              </span>
              <span className="panel-player__info">
                <span className="panel-player__name">
                  <span className="panel-player__name-text" title={player.name}>{player.name}</span>
                  {isMe && <span className="panel-player__you">You</span>}
                  {player.isBot && <span className="panel-player__tag">Bot</span>}
                  {player.autopilot && <span className="panel-player__tag">Away · bot playing</span>}
                </span>
                <span className="panel-player__line">
                  <span className={`panel-player__money${player.money < 0 ? ' money--negative' : ''}`}>{formatRM(player.money)}</span>
                  <span className="panel-player__stats">
                    <span title="Properties"><Building2 size={11} aria-hidden="true" /> {player.properties.length}<span className="sr-only"> properties</span></span>
                    <span title="Correct answers"><CheckCircle2 size={11} aria-hidden="true" /> {player.totalCorrect}/{player.totalQuestions}<span className="sr-only"> correct</span></span>
                  </span>
                </span>
                {badges.length > 0 && <span className="panel-player__badges">{badges}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
