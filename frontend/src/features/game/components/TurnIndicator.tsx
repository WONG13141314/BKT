import { Player } from '../types/game.types';
import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
}

function getPhaseHint(phase: string, isMyTurn: boolean): string | null {
  if (isMyTurn) {
    switch (phase) {
      case 'ROLL_PHASE':
        return 'Roll the dice';
      case 'BUY_DECISION':
      case 'JAIL_DECISION':
      case 'LEVEL_UP_OFFER':
      case 'CARD_DRAW':
        return 'Make your move';
      case 'ROLL_CHALLENGE':
      case 'SMART_BUY_CHALLENGE':
      case 'CARD_MATH_CHALLENGE':
      case 'JAIL_CHALLENGE':
      case 'LEVEL_UP_CHALLENGE':
        return 'Answer the question';
      case 'MATH_DUEL':
        return 'Math duel!';
      default:
        return null;
    }
  }

  switch (phase) {
    case 'ROLL_CHALLENGE':
    case 'SMART_BUY_CHALLENGE':
    case 'CARD_MATH_CHALLENGE':
    case 'JAIL_CHALLENGE':
    case 'LEVEL_UP_CHALLENGE':
      return 'Answering';
    // A duel involves the owner too, so it is never just "their" turn.
    case 'MATH_DUEL':
      return 'Math duel';
    case 'BUY_DECISION':
    case 'JAIL_DECISION':
    case 'LEVEL_UP_OFFER':
    case 'CARD_DRAW':
      return 'Deciding';
    default:
      return null;
  }
}

export function TurnIndicator({
  currentPlayer,
  isMyTurn,
  turnPhase,
}: TurnIndicatorProps) {
  if (!currentPlayer) return null;

  const hint = getPhaseHint(turnPhase, isMyTurn);

  return (
    <div className="turn-banner-wrapper">
      <div className={`turn-banner ${isMyTurn ? 'turn-banner--you' : ''}`}>
        <span className="turn-banner__who">
          {isMyTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
        </span>
        {hint && (
          <span className="turn-banner__sep">—</span>
        )}
        {hint && (
          <span className="turn-banner__hint">{hint}</span>
        )}
      </div>
    </div>
  );
}
