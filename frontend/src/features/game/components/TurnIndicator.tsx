import './TurnIndicator.css';
import { TurnPhase, Player } from '../types/game.types';
import { Dices, Brain, Footprints, MapPin, Zap, SkipForward } from 'lucide-react';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: TurnPhase;
  round: number;
  maxRounds: number;
}

const PHASE_CONFIG: Record<TurnPhase, { icon: React.ReactNode; label: string }> = {
  ROLL: { icon: <Dices size={13} />, label: 'Roll' },
  MATH_CHALLENGE: { icon: <Brain size={13} />, label: 'Challenge' },
  MOVING: { icon: <Footprints size={13} />, label: 'Moving' },
  TILE_EVENT: { icon: <MapPin size={13} />, label: 'Event' },
  ACTION: { icon: <Zap size={13} />, label: 'Action' },
  END: { icon: <SkipForward size={13} />, label: 'Ending' },
};

export function TurnIndicator({
  currentPlayer,
  isMyTurn,
  turnPhase,
  round,
  maxRounds,
}: TurnIndicatorProps) {
  const phase = PHASE_CONFIG[turnPhase] || { icon: null, label: turnPhase };

  return (
    <div className={`turn-indicator-container ${isMyTurn ? 'my-turn' : ''}`}>
      <div className="turn-indicator glass-panel">
        <div className={`turn-dot ${isMyTurn ? 'turn-dot--active' : ''}`} />
        <div className="turn-text">
          {isMyTurn ? (
            <span className="turn-text--mine heading-display">Your Turn</span>
          ) : (
            <span>
              Waiting for{' '}
              <strong style={{ color: currentPlayer?.color }}>
                {currentPlayer?.name || '...'}
              </strong>
            </span>
          )}
        </div>
        <div className="turn-phase-label">
          {phase.icon}
          {phase.label}
        </div>
        <div className="turn-round">
          R{round}/{maxRounds}
        </div>
      </div>
    </div>
  );
}
