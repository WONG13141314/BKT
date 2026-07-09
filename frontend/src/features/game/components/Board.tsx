import { useState } from 'react';
import './Board.css';
import { BOARD_TILES, getGridPosition, COLOR_GROUPS } from '../config/board.config';
import { PropertyState, Player } from '../types/game.types';
import { HelpCircle, Gift, Coins, Rocket, Lock, ParkingCircle, Siren } from 'lucide-react';

interface BoardProps {
  players: Player[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  onTileClick?: (tileIndex: number) => void;
}

const TILE_ICON_MAP: Record<string, React.ReactNode> = {
  GO: <Rocket size={14} />,
  JAIL: <Lock size={14} />,
  FREE_PARKING: <ParkingCircle size={14} />,
  GO_TO_JAIL: <Siren size={14} />,
  CHANCE: <HelpCircle size={14} />,
  COMMUNITY_CHEST: <Gift size={14} />,
  TAX: <Coins size={14} />,
};

export function Board({ players, properties, currentPlayerIndex, onTileClick }: BoardProps) {
  const [hoveredTile, setHoveredTile] = useState<number | null>(null);

  return (
    <div className="board-container">
      <div className="game-board">
        {/* Render the perimeter tiles */}
        {BOARD_TILES.map((tile) => {
          const gridPos = getGridPosition(tile.index);
          const property = properties.find((p) => p.tileIndex === tile.index);
          const owner = property?.ownerId
            ? players.find((p) => p.id === property.ownerId)
            : null;
          const colorGroup = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
          const isCorner = [0, 7, 14, 21].includes(tile.index);
          const playersOnTile = players.filter((p) => p.position === tile.index);
          const icon = TILE_ICON_MAP[tile.type] || null;

          return (
            <div
              key={tile.index}
              className={`tile tile--${tile.type.toLowerCase()} ${isCorner ? 'tile--corner' : ''} ${hoveredTile === tile.index ? 'tile--hovered' : ''} ${owner ? 'tile--owned' : ''}`}
              style={{
                gridRow: gridPos.gridRow,
                gridColumn: gridPos.gridColumn,
              }}
              onClick={() => onTileClick?.(tile.index)}
              onMouseEnter={() => setHoveredTile(tile.index)}
              onMouseLeave={() => setHoveredTile(null)}
              data-tile-index={tile.index}
            >
              {/* Color group strip */}
              {colorGroup && (
                <div
                  className="tile__color-strip"
                  style={{ backgroundColor: colorGroup.color }}
                />
              )}

              <div className="tile__content">
                {/* Tile icon for special tiles */}
                {icon && <span className="tile__icon">{icon}</span>}

                {/* Tile name */}
                <span className="tile__name">
                  {tile.type === 'PROPERTY' ? tile.name : (icon ? '' : tile.name)}
                </span>

                {/* Price for properties */}
                {tile.type === 'PROPERTY' && (
                  <span className="tile__price">${tile.price}</span>
                )}

                {/* Houses/Hotel indicators */}
                {property && (property.houses > 0 || property.hasHotel) && (
                  <div className="tile__buildings">
                    {property.hasHotel ? (
                      <span className="tile__hotel" title="Hotel" />
                    ) : (
                      Array.from({ length: property.houses }).map((_, i) => (
                        <span key={i} className="tile__house" title="House" />
                      ))
                    )}
                  </div>
                )}

                {/* Owner indicator */}
                {owner && (
                  <div
                    className="tile__owner-dot"
                    style={{ backgroundColor: owner.color }}
                    title={`Owned by ${owner.name}`}
                  />
                )}
              </div>

              {/* Player tokens on this tile */}
              {playersOnTile.length > 0 && (
                <div className="tile__players">
                  {playersOnTile.map((p) => (
                    <div
                      key={p.id}
                      className={`tile__token ${p.id === players[currentPlayerIndex]?.id ? 'tile__token--active' : ''}`}
                      style={{ backgroundColor: p.color }}
                      title={p.name}
                    >
                      {p.name.charAt(0)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Center of the board */}
        <div className="board-center">
          <div className="center-content">
            <h2 className="heading-display board-logo">MATH<br />MONOPOLY</h2>
            <p className="board-subtitle">Learn &amp; Earn</p>
          </div>
        </div>
      </div>
    </div>
  );
}
