import { useEffect, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { GameState, formatRM } from '../types/game.types';
import { BOARD_TILES, COLOR_GROUPS, getGridPosition } from '../config/board.config';
import { BoardPiecesScene } from './BoardPiecesScene';
import { PhysicsDice } from './PhysicsDice';
import './Board.css';

interface Props {
  gameState: GameState;
  selectedTile: number;
  onTileSelect: (tileIndex: number) => void;
  isMyTurn: boolean;
  rollRequested: boolean;
  onRollClick: () => void;
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
  isMyTurn,
  rollRequested,
  onRollClick,
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
        const forward = (target - position + BOARD_TILES.length) % BOARD_TILES.length;
        next[id] = forward > 12 ? target : (position + 1) % BOARD_TILES.length;
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
  }, [onMovementChange, onMovementComplete]);

  const visualPlayers = players.map((player) => ({
    ...player,
    position: visualPositions[player.id] ?? player.position,
  }));
  const canRoll = isMyTurn && gameState.turnPhase === 'ROLL_PHASE' && !rollRequested;
  const centerActionLabel = rollRequested
    ? 'Rolling…'
    : canRoll
      ? 'Roll Dice'
      : gameState.turnPhase === 'MOVING'
        ? 'Rolling…'
        : !isMyTurn
          ? 'Wait'
          : gameState.turnPhase === 'BUY_DECISION'
            ? 'Choose on Deed'
            : gameState.turnPhase === 'JAIL_DECISION'
              ? 'Choose Jail Action'
              : gameState.turnPhase === 'END_TURN'
                ? 'Review & End Turn'
                : gameState.turnPhase === 'AUCTION'
                  ? 'Auction in Progress'
                  : 'Action in Progress';

  return (
    <div className="board-grid">
      {BOARD_TILES.map((tile) => {
        const position = getGridPosition(tile.index);
        const group = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
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
              '--color-group': group?.color ?? 'transparent',
            } as React.CSSProperties}
            onClick={() => onTileSelect(tile.index)}
            aria-label={`View ${tile.name}`}
          >
            {group && <div className="tile-color-strip" style={{ background: group.color }} />}
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
        <div className="board-brand"><strong>MATHOPOLY</strong><span>STANDARD 1 KSSR</span></div>
        <PhysicsDice
          values={gameState.diceValues}
          rollId={gameState.diceRollId}
          onRollingChange={onDiceRollingChange}
        />
        <button className={`dice-roll-btn ${canRoll ? 'dice-roll-btn--active' : ''}`} onClick={onRollClick} disabled={!canRoll}>
          <Dices size={18} />
          {centerActionLabel}
        </button>
      </div>

      <BoardPiecesScene players={visualPlayers} />
    </div>
  );
}
