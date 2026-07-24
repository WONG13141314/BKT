import React from 'react';
import { Player, TileConfig, formatRM } from '../types/game.types';
import { Sparkles, Zap, Home, Receipt, ShieldAlert, Coffee, Rocket, Lock } from 'lucide-react';
import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
  landedTile?: TileConfig | null;
  isLanding?: boolean;
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
  landedTile,
  isLanding,
}: TurnIndicatorProps) {
  if (!currentPlayer) return null;

  const phaseLabel = PHASE_LABELS[turnPhase] || turnPhase;

  // Render Landing State if pawn has arrived at destination tile
  if (isLanding && landedTile) {
    const landingInfo = getLandingDetails(landedTile);

    return (
      <div className="turn-banner-wrapper">
        <div className={`monopoly-banner monopoly-banner--landing monopoly-banner--${landingInfo.theme}`}>
          {/* Top Player Tag */}
          <div className="monopoly-banner__tag">
            <span
              className="monopoly-banner__color-dot"
              style={{ backgroundColor: currentPlayer.color }}
            />
            <span className="monopoly-banner__player-name">
              {isMyTurn ? 'You landed on' : `${currentPlayer.name} landed on`}
            </span>
          </div>

          {/* Main Landing Info */}
          <div className="monopoly-banner__content">
            <span className="monopoly-banner__icon">{landingInfo.icon}</span>
            <div className="monopoly-banner__details">
              <span className="monopoly-banner__title">{landingInfo.title}</span>
              <span className="monopoly-banner__subtitle">{landingInfo.subtitle}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Standard Turn State
  return (
    <div className="turn-banner-wrapper">
      <div className={`monopoly-banner ${isMyTurn ? 'monopoly-banner--my-turn' : ''}`}>
        <div className="monopoly-banner__player">
          <span
            className="monopoly-banner__color-dot"
            style={{ backgroundColor: currentPlayer.color }}
          />
          <span className="monopoly-banner__name">
            {isMyTurn ? 'YOUR TURN' : `${currentPlayer.name.toUpperCase()}'S TURN`}
            {currentPlayer.isBot && !isMyTurn && ' 🤖'}
          </span>
        </div>
        <div className="monopoly-banner__phase">{phaseLabel}</div>
      </div>
    </div>
  );
}

function getLandingDetails(tile: TileConfig) {
  switch (tile.type) {
    case 'PROPERTY':
      return {
        icon: <Home size={20} />,
        title: tile.name,
        subtitle: `Property • ${formatRM(tile.price)}`,
        theme: 'property',
      };
    case 'CHALLENGE_CARD':
      return {
        icon: <Zap size={20} />,
        title: 'CHALLENGE CARD',
        subtitle: 'Draw a card & answer the challenge',
        theme: 'challenge',
      };
    case 'TAX':
      return {
        icon: <Receipt size={20} />,
        title: tile.name,
        subtitle: `Tax Payment • ${formatRM(tile.price || 50)}`,
        theme: 'tax',
      };
    case 'LUCKY_BREAK':
      return {
        icon: <Sparkles size={20} />,
        title: 'LUCKY BREAK!',
        subtitle: 'Special reward opportunity',
        theme: 'lucky',
      };
    case 'GO_TO_JAIL':
      return {
        icon: <ShieldAlert size={20} />,
        title: 'GO TO JAIL!',
        subtitle: 'Move directly to jail',
        theme: 'jail',
      };
    case 'JAIL':
      return {
        icon: <Lock size={20} />,
        title: 'VISITING JAIL',
        subtitle: 'Just visiting',
        theme: 'visiting',
      };
    case 'GO':
      return {
        icon: <Rocket size={20} />,
        title: 'PASSED GO!',
        subtitle: 'Collect salary RM150',
        theme: 'go',
      };
    case 'REST':
      return {
        icon: <Coffee size={20} />,
        title: 'REST AREA',
        subtitle: 'Take a brief pause',
        theme: 'rest',
      };
    default:
      return {
        icon: <Sparkles size={20} />,
        title: tile.name,
        subtitle: 'Landed on tile',
        theme: 'default',
      };
  }
}
