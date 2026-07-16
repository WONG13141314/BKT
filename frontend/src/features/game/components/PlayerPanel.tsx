import { Player } from '../types/game.types';
import { Lock, AlertTriangle, Flame, Target, Building2, CheckCircle2 } from 'lucide-react';
import './PlayerPanel.css';

interface PlayerPanelProps {
  players: Player[];
  currentPlayerIndex: number;
  myPlayerId: string;
  round: number;
  maxRounds: number;
}

export function PlayerPanel({
  players,
  currentPlayerIndex,
  myPlayerId,
  round,
  maxRounds,
}: PlayerPanelProps) {
  return (
    <aside className="player-panel">
      {/* Round Counter */}
      <div className="panel-round">
        <span className="panel-round__label">Round</span>
        <span className="panel-round__value">{round} / {maxRounds}</span>
        <div className="panel-round__bar">
          <div
            className="panel-round__fill"
            style={{ width: `${(round / maxRounds) * 100}%` }}
          />
        </div>
      </div>

      {/* Player Cards */}
      <div className="panel-players">
        {players.map((player, idx) => {
          const isCurrentTurn = idx === currentPlayerIndex;
          const isMe = player.id === myPlayerId;

          return (
            <div
              key={player.id}
              className={`panel-player ${isCurrentTurn ? 'panel-player--active' : ''} ${isMe ? 'panel-player--me' : ''} ${player.isInDebt ? 'panel-player--debt' : ''}`}
            >
              {/* Player Header */}
              <div className="panel-player__header">
                <div
                  className="panel-player__avatar"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="panel-player__info">
                  <span className="panel-player__name">
                    {player.name}
                    {isMe && <span className="panel-player__you"> (You)</span>}
                  </span>
                  <span className={`panel-player__money ${player.money < 0 ? 'money--negative' : ''}`}>
                    ${player.money.toLocaleString()}
                  </span>
                </div>
                {isCurrentTurn && (
                  <span className="panel-player__turn-badge">
                    <Target size={16} />
                  </span>
                )}
              </div>

              {/* Status Badges */}
              <div className="panel-player__badges">
                {player.isInJail && (
                  <span className="badge badge--jail"><Lock size={10} /> Jail</span>
                )}
                {player.isInDebt && (
                  <span className="badge badge--debt"><AlertTriangle size={10} /> Debt</span>
                )}
                {player.streak >= 3 && (
                  <span className="badge badge--streak"><Flame size={10} /> {player.streak}</span>
                )}
              </div>

              {/* Stats Row */}
              <div className="panel-player__stats">
                <div className="stat">
                  <span className="stat__label"><Building2 size={10} /> Props</span>
                  <span className="stat__value">{player.properties.length}</span>
                </div>
                <div className="stat">
                  <span className="stat__label"><CheckCircle2 size={10} /> Score</span>
                  <span className="stat__value">
                    {player.totalCorrect}/{player.totalQuestions}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
