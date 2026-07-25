import { useState, useEffect, useRef } from 'react';
import { GameState, Player, PropertyState, formatRM } from '../types/game.types';
import { BOARD_TILES, COLOR_GROUPS, getGridPosition } from '../config/board.config';
import './Board.css';

interface Props {
  gameState: GameState;
  currentPlayerId: string;
  onMovementChange?: (isMoving: boolean) => void;
  onMovementComplete?: () => void;
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

export function Board({ gameState, currentPlayerId, onMovementChange, onMovementComplete }: Props) {
  const { players, properties } = gameState;
  
  // Track visual positions for animations
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    players.forEach(p => { initial[p.id] = p.position; });
    return initial;
  });

  // Target positions ref so we can update without triggering useEffect re-runs
  const targetPositions = useRef<Record<string, number>>({});
  const wasMovingRef = useRef(false);
  
  useEffect(() => {
    // Update target positions from game state
    players.forEach(p => {
      targetPositions.current[p.id] = p.position;
      // Initialize if new player joins mid-game
      setVisualPositions(prev => {
        if (prev[p.id] === undefined) return { ...prev, [p.id]: p.position };
        return prev;
      });
    });
  }, [players]);

  // Animation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setVisualPositions(prev => {
        let changed = false;
        let stillMoving = false;
        const next = { ...prev };

        for (const [id, targetPos] of Object.entries(targetPositions.current)) {
          const currentPos = next[id];
          if (currentPos !== undefined && currentPos !== targetPos) {
            // Calculate distance forward
            const distForward = (targetPos - currentPos + BOARD_TILES.length) % BOARD_TILES.length;
            
            // If distance > 12, it's a teleport (e.g., Go To Jail), so jump instantly.
            // Max dice roll is 12.
            if (distForward > 12) {
              next[id] = targetPos;
            } else {
              // Move 1 step forward
              next[id] = (currentPos + 1) % BOARD_TILES.length;
              if (next[id] !== targetPos) {
                stillMoving = true;
              }
            }
            changed = true;
          }
        }

        if (changed || stillMoving) {
          if (!wasMovingRef.current) {
            wasMovingRef.current = true;
            onMovementChange?.(true);
          }
        } else if (wasMovingRef.current) {
          wasMovingRef.current = false;
          onMovementChange?.(false);
          onMovementComplete?.();
        }

        return changed ? next : prev;
      });
    }, 200); // 200ms per tile step

    return () => clearInterval(interval);
  }, [onMovementChange, onMovementComplete]);

  return (
    <div className="board-grid">
      {BOARD_TILES.map((tile) => {
        const pos = getGridPosition(tile.index);
        const colorGroup = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
        const property = properties.find((p) => p.tileIndex === tile.index);
        const owner = property?.ownerId
          ? players.find((p) => p.id === property.ownerId)
          : null;
          
        // Use visualPositions instead of p.position
        const playersOnTile = players.filter((p) => visualPositions[p.id] === tile.index && !p.isBankrupt);

        // Determine rotation class based on position
        let rotationClass = '';
        if (tile.index >= 0 && tile.index <= 5) rotationClass = 'tile-rotate-bottom';
        else if (tile.index >= 6 && tile.index <= 9) rotationClass = 'tile-rotate-left';
        else if (tile.index >= 10 && tile.index <= 15) rotationClass = 'tile-rotate-top';
        else if (tile.index >= 16 && tile.index <= 19) rotationClass = 'tile-rotate-right';

        return (
          <div
            key={tile.index}
            className={`board-tile tile-${tile.type.toLowerCase().replace('_', '-')} ${rotationClass} ${
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
