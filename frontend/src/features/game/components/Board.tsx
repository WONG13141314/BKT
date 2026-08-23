import { useEffect, useRef, useState } from 'react';
import { GameState, formatRM } from '../types/game.types';
import { COLOR_GROUP_PRESENTATION, getGridPosition } from '../config/board.presentation';
import { BoardPiecesScene } from './BoardPiecesScene';
import { PhysicsDice } from './PhysicsDice';
import './Board.css';

interface Props {
  gameState: GameState;
  selectedTile: number;
  onTileSelect: (tileIndex: number) => void;
  onDiceRollingChange?: (rolling: boolean) => void;
  onMovementChange?: (isMoving: boolean) => void;
  onMovementComplete?: () => void;
}

const TILE_ICONS: Record<string, string> = {
  GO: 'GO',
  JAIL: 'JAIL',
  GO_TO_JAIL: 'GO TO JAIL',
  LUCKY_BREAK: 'LUCKY',
  TAX: 'TAX',
  CHALLENGE_CARD: '?',
  REST: 'REST',
};

export function Board({
  gameState,
  selectedTile,
  onTileSelect,
  onDiceRollingChange,
  onMovementChange,
  onMovementComplete,
}: Props) {
  const { players, properties } = gameState;
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.position]))
  );
  const visualPositionsRef = useRef(visualPositions);
  const targetPositions = useRef<Record<string, number>>({});
  const wasMoving = useRef(false);
  const lastRollId = useRef(gameState.diceRollId);
  const movementBlockedUntil = useRef(0);

  useEffect(() => {
    if (gameState.diceRollId !== lastRollId.current) {
      lastRollId.current = gameState.diceRollId;
      movementBlockedUntil.current = Date.now() + 2200;
    }

    const applyTargets = () => {
      const next = { ...visualPositionsRef.current };
      players.forEach((player) => {
        targetPositions.current[player.id] = player.position;
        if (next[player.id] === undefined) next[player.id] = player.position;
      });
      visualPositionsRef.current = next;
      setVisualPositions(next);
    };

    const remaining = Math.max(0, movementBlockedUntil.current - Date.now());
    const timer = setTimeout(applyTargets, remaining);
    return () => clearTimeout(timer);
  }, [gameState.diceRollId, players]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = visualPositionsRef.current;
      let changed = false;
      let moving = false;
      const next = { ...current };

      for (const [id, target] of Object.entries(targetPositions.current)) {
        const position = next[id];
        if (position === undefined || position === target) continue;
        const forward = (target - position + gameState.tiles.length) % gameState.tiles.length;
        next[id] = forward > 12 ? target : (position + 1) % gameState.tiles.length;
        changed = true;
        if (next[id] !== target) moving = true;
      }

      if (changed) {
        visualPositionsRef.current = next;
        setVisualPositions(next);
      }

      if (changed || moving) {
        if (!wasMoving.current) {
          wasMoving.current = true;
          onMovementChange?.(true);
        }
      } else if (wasMoving.current) {
        wasMoving.current = false;
        onMovementChange?.(false);
        onMovementComplete?.();
      }
    }, 280);

    return () => clearInterval(interval);
  }, [gameState.tiles.length, onMovementChange, onMovementComplete]);

  const visualPlayers = players.map((player) => ({
    ...player,
    position: visualPositions[player.id] ?? player.position,
  }));
  const centerStatus = gameState.turnPhase === 'MOVING' ? 'Moving…' : 'Game in progress';

  return (
    <div className="board-grid">
      {gameState.tiles.map((tile) => {
        const position = getGridPosition(tile.index);
        const groupColor = tile.colorGroup ? COLOR_GROUP_PRESENTATION[tile.colorGroup] : null;
        const property = properties.find((item) => item.tileIndex === tile.index);
        const owner = property?.ownerId ? players.find((player) => player.id === property.ownerId) : null;
        const side = tile.index <= 5 ? 'bottom' : tile.index <= 9 ? 'left' : tile.index <= 15 ? 'top' : 'right';

        return (
          <button
            type="button"
            key={tile.index}
            className={`board-tile tile-${tile.type.toLowerCase().replace('_', '-')} tile-rotate-${side} ${selectedTile === tile.index ? 'selected-tile' : ''}`}
            style={{
              gridRow: position.gridRow,
              gridColumn: position.gridColumn,
              '--color-group': groupColor ?? 'transparent',
            } as React.CSSProperties}
            onClick={() => onTileSelect(tile.index)}
            aria-label={`View ${tile.name}`}
          >
            {groupColor && <div className="tile-color-strip" style={{ background: groupColor }} />}
            <div className="tile-content">
              <span className="tile-icon">{tile.type === 'PROPERTY' ? '' : TILE_ICONS[tile.type]}</span>
              <span className="tile-name">{tile.name}</span>
              {tile.type === 'PROPERTY' && <span className="tile-price">{formatRM(tile.price)}</span>}
              {tile.type === 'TAX' && <span className="tile-price">{formatRM(tile.name === 'Cukai Mewah' ? 75 : 50)}</span>}
            </div>
            {property?.isLeveledUp && <span className="house-sticker" aria-label="House built"><i /><b /></span>}
            {owner && (
              <span
                className="tile-owner-marker"
                style={{ background: owner.color }}
                title={`Owned by ${owner.name}`}
                aria-label={`Owned by ${owner.name}`}
              />
            )}
          </button>
        );
      })}

      <div className="board-center">
        <div className="board-brand"><strong>MATHOPOLY</strong><span>ROLL • SOLVE • OWN</span></div>
        <PhysicsDice
          values={gameState.diceValues}
          rollId={gameState.diceRollId}
          onRollingChange={onDiceRollingChange}
        />
        <div className="dice-roll-btn" aria-live="polite">{centerStatus}</div>
      </div>

      <BoardPiecesScene players={visualPlayers} />
    </div>
  );
}
