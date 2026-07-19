import { Player } from '../types/game.types';
import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
}

const PHASE_LABELS: Record<string, string> = {
  ROLL_PHASE: '🎲 Roll Phase',
  DICE_CHALLENGE: '⚡ Dice Challenge!',
  MOVING: '🏃 Moving...',
  RESOLVE_TILE: '📍 Resolving...',
  BUY_DECISION: '🏠 Buy Decision',
  SMART_BUY_CHALLENGE: '🏷️ Smart Buy Challenge',
  RENT_PAYMENT: '💰 Rent Due',
  RENT_CHALLENGE: '🛡️ Rent Defense',
  CARD_DRAW: '🃏 Challenge Card!',
  CARD_MATH_CHALLENGE: '🧮 Card Challenge',
  JAIL_DECISION: '🔒 Jail Decision',
  JAIL_CHALLENGE: '🔓 Jail Escape',
  LEVEL_UP_OFFER: '⭐ Level Up!',
  LEVEL_UP_CHALLENGE: '⭐ Level Up Challenge',
  END_TURN: '✅ End Turn',
};

export function TurnIndicator({
  currentPlayer,
  isMyTurn,
  turnPhase,
}: TurnIndicatorProps) {
  if (!currentPlayer) return null;

  const phaseLabel = PHASE_LABELS[turnPhase] || turnPhase;

  return (
    <div className="turn-indicator-container">
      <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
        <div className={`turn-dot ${isMyTurn ? 'turn-dot--active' : ''}`} />
        <div className={`turn-text ${isMyTurn ? 'turn-text--mine' : ''}`}>
          {isMyTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
          {currentPlayer.isBot && !isMyTurn && ' 🤖'}
        </div>
        <div className="turn-phase-label">{phaseLabel}</div>
      </div>
    </div>
  );
}
