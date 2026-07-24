import React from 'react';
import { TileConfig, formatRM } from '../types/game.types';
import {
  Sparkles,
  Zap,
  Home,
  Receipt,
  ShieldAlert,
  Coffee,
  Rocket,
  Lock,
} from 'lucide-react';
import './LandingBanner.css';

interface Props {
  tile: TileConfig | null;
  playerName?: string;
  playerColor?: string;
}

export const LandingBanner: React.FC<Props> = ({ tile, playerName, playerColor }) => {
  if (!tile) return null;

  const getTileInfo = () => {
    switch (tile.type) {
      case 'PROPERTY':
        return {
          icon: <Home className="landing-banner__icon" size={24} />,
          title: tile.name,
          subtitle: `Property • ${formatRM(tile.price)}`,
          theme: 'property',
        };
      case 'CHALLENGE_CARD':
        return {
          icon: <Zap className="landing-banner__icon" size={24} />,
          title: 'Challenge Card!',
          subtitle: 'Draw a card & answer the challenge',
          theme: 'challenge',
        };
      case 'TAX':
        return {
          icon: <Receipt className="landing-banner__icon" size={24} />,
          title: tile.name,
          subtitle: 'Pay tax to the bank',
          theme: 'tax',
        };
      case 'LUCKY_BREAK':
        return {
          icon: <Sparkles className="landing-banner__icon" size={24} />,
          title: 'Lucky Break!',
          subtitle: 'Special reward opportunity',
          theme: 'lucky',
        };
      case 'GO_TO_JAIL':
        return {
          icon: <ShieldAlert className="landing-banner__icon" size={24} />,
          title: 'Go To Jail!',
          subtitle: 'Do not collect GO salary',
          theme: 'jail',
        };
      case 'JAIL':
        return {
          icon: <Lock className="landing-banner__icon" size={24} />,
          title: 'Visiting Jail',
          subtitle: 'Just visiting',
          theme: 'visiting',
        };
      case 'GO':
        return {
          icon: <Rocket className="landing-banner__icon" size={24} />,
          title: 'Passed GO!',
          subtitle: 'Collect salary RM200',
          theme: 'go',
        };
      case 'REST':
        return {
          icon: <Coffee className="landing-banner__icon" size={24} />,
          title: 'Rest Area',
          subtitle: 'Take a quick break',
          theme: 'rest',
        };
      default:
        return {
          icon: <Sparkles className="landing-banner__icon" size={24} />,
          title: tile.name,
          subtitle: 'Landed on tile',
          theme: 'default',
        };
    }
  };

  const info = getTileInfo();

  return (
    <div className={`landing-banner landing-banner--${info.theme}`}>
      <div className="landing-banner__badge">
        {playerColor && (
          <span
            className="landing-banner__player-dot"
            style={{ backgroundColor: playerColor }}
          />
        )}
        <span className="landing-banner__player-name">
          {playerName ? `${playerName} landed on` : 'Landed on'}
        </span>
      </div>
      <div className="landing-banner__content">
        <div className="landing-banner__icon-wrapper">{info.icon}</div>
        <div className="landing-banner__text">
          <h4 className="landing-banner__title">{info.title}</h4>
          <p className="landing-banner__subtitle">{info.subtitle}</p>
        </div>
      </div>
    </div>
  );
};
