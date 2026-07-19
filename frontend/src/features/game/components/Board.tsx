import { GameState, Player, PropertyState, formatRM } from '../types/game.types';
import { BOARD_TILES, COLOR_GROUPS, getGridPosition } from '../config/board.config';
import './Board.css';

interface Props {
  gameState: GameState;
  currentPlayerId: string;
}

// Tile type icons
const TILE_ICONS: Record<string, string> = {
  GO: '🚀',
  JAIL: '🔒',
  GO_TO_JAIL: '🚔',
  LUCKY_BREAK: '🍀',
  TAX: '💰',
  CHALLENGE_CARD: '⚡',
  REST: '☕',
};

export function Board({ gameState, currentPlayerId }: Props) {
  const { players, properties } = gameState;

  return (
    <div className="board-grid">
      {BOARD_TILES.map((tile) => {
        const pos = getGridPosition(tile.index);
        const colorGroup = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
        const property = properties.find((p) => p.tileIndex === tile.index);
        const owner = property?.ownerId
          ? players.find((p) => p.id === property.ownerId)
          : null;
        const playersOnTile = players.filter((p) => p.position === tile.index && !p.isBankrupt);

        return (
          <div
            key={tile.index}
            className={`board-tile tile-${tile.type.toLowerCase().replace('_', '-')} ${
              tile.index === players.find((p) => p.id === currentPlayerId)?.position
                ? 'current-tile'
                : ''
            }`}
            style={{
              gridRow: pos.gridRow,
              gridColumn: pos.gridColumn,
              '--color-group': colorGroup?.color ?? 'transparent',
            } as React.CSSProperties}
          >
            {/* Color strip for properties */}
            {colorGroup && <div className="tile-color-strip" style={{ background: colorGroup.color }} />}

            {/* Tile content */}
            <div className="tile-content">
              <span className="tile-icon">
                {tile.type === 'PROPERTY'
                  ? (property?.isLeveledUp ? '⭐' : '')
                  : (TILE_ICONS[tile.type] ?? '')}
              </span>
              <span className="tile-name">{tile.name}</span>
              {tile.type === 'PROPERTY' && (
                <span className="tile-price">{formatRM(tile.price)}</span>
              )}
              {tile.type === 'TAX' && (
                <span className="tile-price">
                  {tile.name === 'Cukai Mewah' ? formatRM(75) : formatRM(50)}
                </span>
              )}
            </div>

            {/* Owner indicator */}
            {owner && (
              <div className="tile-owner" style={{ background: owner.color }}>
                {owner.isBot ? '🤖' : owner.name.charAt(0)}
              </div>
            )}

            {/* Player tokens */}
            {playersOnTile.length > 0 && (
              <div className="tile-players">
                {playersOnTile.map((p) => (
                  <div
                    key={p.id}
                    className={`player-token ${p.id === currentPlayerId ? 'my-token' : ''}`}
                    style={{ background: p.color }}
                    title={p.name}
                  >
                    {p.isBot ? '🤖' : p.name.charAt(0)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Center area */}
      <div className="board-center">
        <h2 className="board-title">MathOpoly</h2>
        <p className="board-subtitle">Standard 1 KSSR</p>
      </div>
    </div>
  );
}
