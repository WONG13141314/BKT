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
        return 'Choose: offer, buy or skip';
      case 'JAIL_DECISION':
        return 'Choose how to leave jail';
      case 'CARD_DRAW':
        return 'Open the card';
      case 'MOVING':
      case 'RESOLVE_TILE':
        return 'Moving your token';
      case 'END_TURN':
        return 'Review the board, then end turn';
      case 'SMART_BUY_CHALLENGE':
      case 'CARD_MATH_CHALLENGE':
      case 'JAIL_CHALLENGE':
        return 'Answer the question';
      case 'MATH_DUEL':
        return 'Math duel!';
      default:
        return null;
    }
  }

  switch (phase) {
    case 'SMART_BUY_CHALLENGE':
    case 'CARD_MATH_CHALLENGE':
    case 'JAIL_CHALLENGE':
      return 'Answering';
    // A duel involves the owner too, so it is never just "their" turn.
    case 'MATH_DUEL':
      return 'Math duel';
    case 'BUY_DECISION':
    case 'JAIL_DECISION':
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
