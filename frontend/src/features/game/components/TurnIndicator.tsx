import React from 'react';
import { Player, TileConfig, formatRM } from '../types/game.types';
import { Home, Zap, Receipt, ShieldAlert, Lock, Rocket } from 'lucide-react';
import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
  landedTile?: TileConfig | null;
  isLanding?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Phase → one short action hint (only when useful)                  */
/* ------------------------------------------------------------------ */

function getPhaseHint(phase: string, isMyTurn: boolean): string | null {
  // Phases where the player needs to act — give a nudge
  if (isMyTurn) {
    switch (phase) {
      case 'ROLL_PHASE':
        return 'Roll the dice!';
      case 'BUY_DECISION':
      case 'RENT_PAYMENT':
      case 'JAIL_DECISION':
      case 'LEVEL_UP_OFFER':
      case 'CARD_DRAW':
        return 'Make your move';
      case 'DICE_CHALLENGE':
      case 'SMART_BUY_CHALLENGE':
      case 'RENT_CHALLENGE':
      case 'CARD_MATH_CHALLENGE':
      case 'JAIL_CHALLENGE':
      case 'LEVEL_UP_CHALLENGE':
        return 'Answer the question!';
      // MOVING, RESOLVE_TILE, END_TURN — nothing to say, UI speaks for itself
      default:
        return null;
    }
  }

  // Opponent's turn — keep it quiet, only call out interesting moments
  switch (phase) {
    case 'DICE_CHALLENGE':
    case 'SMART_BUY_CHALLENGE':
    case 'RENT_CHALLENGE':
    case 'CARD_MATH_CHALLENGE':
    case 'JAIL_CHALLENGE':
    case 'LEVEL_UP_CHALLENGE':
      return 'Answering...';
    case 'BUY_DECISION':
    case 'RENT_PAYMENT':
    case 'JAIL_DECISION':
    case 'LEVEL_UP_OFFER':
    case 'CARD_DRAW':
      return 'Deciding...';
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Landing info — only for tiles worth announcing                     */
/* ------------------------------------------------------------------ */

const NOTABLE_TILES: Record<string, {
  icon: React.ReactNode;
  label: (tile: TileConfig) => string;
  theme: string;
}> = {
  PROPERTY: {
    icon: <Home size={16} />,
    label: (t) => `${t.name} · ${formatRM(t.price)}`,
    theme: 'property',
  },
  CHALLENGE_CARD: {
    icon: <Zap size={16} />,
    label: () => 'Challenge Card',
    theme: 'challenge',
  },
  TAX: {
    icon: <Receipt size={16} />,
    label: (t) => `${t.name} · ${formatRM(t.price || 50)}`,
    theme: 'tax',
  },
  GO_TO_JAIL: {
    icon: <ShieldAlert size={16} />,
    label: () => 'Go to Jail!',
    theme: 'jail',
  },
  GO: {
    icon: <Rocket size={16} />,
    label: () => 'Collect RM150!',
    theme: 'go',
  },
};

// REST, JAIL (visiting), LUCKY_BREAK — skipped intentionally. Not worth a banner.

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TurnIndicator({
  currentPlayer,
  isMyTurn,
  turnPhase,
  landedTile,
  isLanding,
}: TurnIndicatorProps) {
  if (!currentPlayer) return null;

  // ---- Landing state (brief flash when pawn stops) ----
  if (isLanding && landedTile) {
    const notable = NOTABLE_TILES[landedTile.type];
    if (!notable) return null; // boring tile → show nothing

    const who = isMyTurn ? 'You' : currentPlayer.name;

    return (
      <div className="turn-banner-wrapper">
        <div className={`turn-banner turn-banner--land turn-banner--${notable.theme}`}>
          <span className="turn-banner__land-icon">{notable.icon}</span>
          <span className="turn-banner__land-text">
            {who} landed on <strong>{notable.label(landedTile)}</strong>
          </span>
        </div>
      </div>
    );
  }

  // ---- Normal turn state ----
  const hint = getPhaseHint(turnPhase, isMyTurn);

  return (
    <div className="turn-banner-wrapper">
      <div className={`turn-banner ${isMyTurn ? 'turn-banner--you' : ''}`}>
        {/* Color dot + name */}
        <span
          className="turn-banner__dot"
          style={{ backgroundColor: currentPlayer.color }}
        />
        <span className="turn-banner__who">
          {isMyTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
          {currentPlayer.isBot && !isMyTurn && ' 🤖'}
        </span>

        {/* Phase hint (only when there's something worth saying) */}
        {hint && (
          <span className="turn-banner__hint">{hint}</span>
        )}
      </div>
    </div>
  );
}
