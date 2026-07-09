import { TileConfig, PropertyState, Player } from '../types/game.types';
import { COLOR_GROUPS } from '../config/board.config';
import { X, Building2, Hotel, Tag, ArrowRight } from 'lucide-react';
import './PropertyCard.css';

interface PropertyCardProps {
  tile: TileConfig;
  property: PropertyState;
  owner: Player | null;
  currentPlayer: Player;
  mode: 'BUY' | 'RENT' | 'INFO';
  rentAmount?: number;
  discountPercent?: number;
  onClose: () => void;
  onBuild?: () => void;
  canBuild?: boolean;
}

export function PropertyCard({
  tile,
  property,
  owner,
  currentPlayer,
  mode,
  rentAmount = 0,
  discountPercent = 0,
  onClose,
  onBuild,
  canBuild = false,
}: PropertyCardProps) {
  const colorGroup = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
  const discountedPrice = discountPercent > 0
    ? Math.round(tile.price * (1 - discountPercent / 100))
    : tile.price;

  return (
    <div className="property-overlay" onClick={onClose}>
      <div className="property-card surface-2" onClick={(e) => e.stopPropagation()}>
        {/* Color Header */}
        <div
          className="property-card__header"
          style={{ backgroundColor: colorGroup?.color || 'var(--surface-3)' }}
        >
          <span className="property-card__name">{tile.name}</span>
          {colorGroup && (
            <span className="property-card__group">{colorGroup.name}</span>
          )}
        </div>

        {/* Card Body */}
        <div className="property-card__body">
          {/* Price */}
          <div className="property-card__row">
            <span>Purchase Price</span>
            <span className="property-card__value">${tile.price}</span>
          </div>

          {/* Rent tiers */}
          <div className="property-card__rent-table">
            <div className="property-card__row">
              <span>Base Rent</span>
              <span>${tile.baseRent}</span>
            </div>
            <div className="property-card__row">
              <span>With 1 House</span>
              <span>${tile.baseRent * 2}</span>
            </div>
            <div className="property-card__row">
              <span>With 2 Houses</span>
              <span>${tile.baseRent * 3}</span>
            </div>
            <div className="property-card__row">
              <span>With 3 Houses</span>
              <span>${tile.baseRent * 4}</span>
            </div>
            <div className="property-card__row">
              <span>With 4 Houses</span>
              <span>${tile.baseRent * 5}</span>
            </div>
            <div className="property-card__row">
              <span>With Hotel</span>
              <span className="property-card__value">${tile.baseRent * 6}</span>
            </div>
          </div>

          <div className="property-card__divider" />

          <div className="property-card__row">
            <span>House Cost</span>
            <span>${tile.houseCost}</span>
          </div>

          {/* Current state */}
          {property.houses > 0 && (
            <div className="property-card__row">
              <span>Houses Built</span>
              <span className="property-card__buildings-display">
                {Array.from({ length: property.houses }).map((_, i) => (
                  <span key={i} className="property-card__house-pip" />
                ))}
              </span>
            </div>
          )}
          {property.hasHotel && (
            <div className="property-card__row">
              <span>Hotel</span>
              <span className="property-card__hotel-pip" />
            </div>
          )}

          {/* Owner */}
          {owner && (
            <div className="property-card__owner">
              <div
                className="property-card__owner-dot"
                style={{ backgroundColor: owner.color }}
              />
              <span>Owned by {owner.name}</span>
            </div>
          )}

          {/* Build button for owned properties */}
          {canBuild && onBuild && (
            <button className="property-card__build-btn" onClick={onBuild}>
              <Building2 size={14} />
              Build House (${tile.houseCost})
            </button>
          )}

          {/* Mode-specific footer */}
          {mode === 'BUY' && (
            <div className="property-card__action">
              {discountPercent > 0 ? (
                <div className="property-card__discount">
                  <span className="discount__original">${tile.price}</span>
                  <ArrowRight size={14} />
                  <span className="discount__final">${discountedPrice}</span>
                  <span className="discount__badge">
                    <Tag size={11} />
                    -{discountPercent}%
                  </span>
                </div>
              ) : (
                <p className="property-card__info-text">
                  Answer correctly for a discount!
                </p>
              )}
            </div>
          )}

          {mode === 'RENT' && (
            <div className="property-card__action property-card__action--rent">
              <span>Rent Due:</span>
              <span className="property-card__rent-amount">${rentAmount}</span>
            </div>
          )}
        </div>

        <button className="property-card__close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
