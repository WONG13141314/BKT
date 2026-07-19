import { TileConfig, PropertyState, Player, formatRM } from '../types/game.types';
import { COLOR_GROUPS } from '../config/board.config';
import { X, Star } from 'lucide-react';
import './PropertyCard.css';

interface PropertyCardProps {
  tile: TileConfig;
  property: PropertyState;
  owner: Player | null;
  currentPlayer: Player;
  onClose: () => void;
}

export function PropertyCard({
  tile,
  property,
  owner,
  currentPlayer,
  onClose,
}: PropertyCardProps) {
  const colorGroup = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
  const isOwned = !!owner;
  const isMyProperty = owner?.id === currentPlayer.id;
  const levelUpCost = Math.floor(tile.price * 0.5);

  return (
    <div className="property-card-overlay" onClick={onClose}>
      <div className="property-card" onClick={(e) => e.stopPropagation()}>
        {/* Color header */}
        <div
          className="property-card__header"
          style={{ background: colorGroup?.color ?? '#4A5568' }}
        >
          <button className="property-card__close" onClick={onClose}>
            <X size={18} />
          </button>
          <h3 className="property-card__name">{tile.name}</h3>
          {tile.skillTheme && (
            <span className="property-card__skill">{tile.skillTheme}</span>
          )}
        </div>

        {/* Price */}
        <div className="property-card__body">
          <div className="property-card__price">
            <span className="price-label">Purchase Price</span>
            <span className="price-value">{formatRM(tile.price)}</span>
          </div>

          {/* Rent Info */}
          <div className="property-card__rent-info">
            <div className="rent-row">
              <span>Base Rent</span>
              <span>{formatRM(tile.baseRent)}</span>
            </div>
            <div className="rent-row">
              <span>Monopoly Rent (2×)</span>
              <span>{formatRM(tile.baseRent * 2)}</span>
            </div>
            <div className="rent-row rent-row--leveled">
              <span><Star size={12} /> Leveled Up Rent</span>
              <span>{formatRM(tile.leveledRent)}</span>
            </div>
            <div className="rent-row">
              <span>Level Up Cost</span>
              <span>{formatRM(levelUpCost)}</span>
            </div>
          </div>

          {/* Ownership */}
          <div className="property-card__status">
            {!isOwned && (
              <span className="status-unowned">Unowned</span>
            )}
            {isOwned && (
              <div className="status-owned">
                <div
                  className="owner-badge"
                  style={{ background: owner!.color }}
                >
                  {owner!.isBot ? '🤖' : owner!.name.charAt(0)}
                </div>
                <span>
                  Owned by {isMyProperty ? 'You' : owner!.name}
                  {owner!.isBot && ' (Bot)'}
                </span>
              </div>
            )}
            {property.isLeveledUp && (
              <span className="status-leveled">
                <Star size={14} /> Leveled Up!
              </span>
            )}
          </div>

          {/* Color Group Info */}
          {colorGroup && (
            <div className="property-card__group">
              <div
                className="group-color-dot"
                style={{ background: colorGroup.color }}
              />
              <span className="group-name">
                {colorGroup.name.charAt(0).toUpperCase() + colorGroup.name.slice(1)} Set
              </span>
              <span className="group-count">
                ({colorGroup.tileIndices.length} properties)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
