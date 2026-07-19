import { Player } from '../types/game.types';
import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
  round: number;
  maxRounds: number;
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
  round,
  maxRounds,
}: TurnIndicatorProps) {
  if (!currentPlayer) return null;

  const phaseLabel = PHASE_LABELS[turnPhase] || turnPhase;

  return (
    <div className={`turn-indicator ${isMyTurn ? 'turn-indicator--my-turn' : ''}`}>
      <div className="turn-indicator__left">
        <div
          className="turn-indicator__avatar"
          style={{ backgroundColor: currentPlayer.color }}
        >
          {currentPlayer.isBot ? '🤖' : currentPlayer.name.charAt(0)}
        </div>
        <div className="turn-indicator__info">
          <span className="turn-indicator__name">
            {isMyTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
            {currentPlayer.isBot && !isMyTurn && ' 🤖'}
          </span>
          <span className="turn-indicator__phase">{phaseLabel}</span>
        </div>
      </div>
      <div className="turn-indicator__round">
        Round {round}/{maxRounds}
      </div>
    </div>
  );
}
