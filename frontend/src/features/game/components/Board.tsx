import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, formatRM } from '../types/game.types';
import { COLOR_GROUP_PRESENTATION, getGridPosition } from '../config/board.presentation';
import { DICE_ROLL_LIMIT_MS, TOKEN_STEP_MS } from './board.animation';
import { BasicBoardTokens, BasicDice, BoardSceneBoundary, hasWebGL2 } from './BoardRendering';
import './Board.css';

const BoardPiecesScene = lazy(() => import('./BoardPiecesScene').then((module) => ({ default: module.BoardPiecesScene })));
const PhysicsDice = lazy(() => import('./PhysicsDice').then((module) => ({ default: module.PhysicsDice })));

interface Props {
  gameState: GameState;
  selectedTile: number;
  onTileSelect: (tileIndex: number) => void;
  onDiceRollingChange?: (rolling: boolean) => void;
  onMovementChange?: (isMoving: boolean) => void;
  onMovementStep?: (tileIndex: number, playerId: string) => void;
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
  onMovementStep,
  onMovementComplete,
}: Props) {
  const { players, properties } = gameState;
  const boardElement = useRef<HTMLDivElement>(null);
  const [canRender3D, setCanRender3D] = useState(hasWebGL2);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.position]))
  );
  const visualPositionsRef = useRef(visualPositions);
  const wasMoving = useRef(false);
  const [settledRollId, setSettledRollId] = useState(0);
  const completedMovementRoll = useRef<number | null>(null);
  const diceStatus = useRef({ rollId: 0, rolling: false });
  const activeRollId = useRef(gameState.diceRollId);
  activeRollId.current = gameState.diceRollId;
  const callbacks = useRef({ onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete });
  callbacks.current = { onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete };
  const diceAnimating = gameState.diceRollId > 0 && settledRollId !== gameState.diceRollId;
  // Money and status broadcasts must not restart the current hop's timer.
  const targetPositionsJson = JSON.stringify(Object.fromEntries(players.map((player) => [player.id, player.position])));
  const targetPositions = useMemo<Record<string, number>>(() => JSON.parse(targetPositionsJson), [targetPositionsJson]);

  useEffect(() => {
    const board = boardElement.current;
    if (!board || !canRender3D) return;
    const useBasicBoard = () => setCanRender3D(false);
    // Capture non-bubbling WebGL events from either canvas.
    board.addEventListener('webglcontextlost', useBasicBoard, true);
    board.addEventListener('webglcontextcreationerror', useBasicBoard, true);
    return () => {
      board.removeEventListener('webglcontextlost', useBasicBoard, true);
      board.removeEventListener('webglcontextcreationerror', useBasicBoard, true);
    };
  }, [canRender3D]);

  const handleDiceRollingChange = useCallback((rolling: boolean) => {
    const rollId = gameState.diceRollId;
    if (activeRollId.current !== rollId) return;
    // A late-loaded scene must not restart an already finished visual roll.
    if (rolling && diceStatus.current.rollId === rollId && !diceStatus.current.rolling) return;
    if (diceStatus.current.rollId !== rollId || diceStatus.current.rolling !== rolling) {
      diceStatus.current = { rollId, rolling };
      callbacks.current.onDiceRollingChange?.(rolling);
    }
    if (!rolling) setSettledRollId(rollId);
  }, [gameState.diceRollId]);

  useEffect(() => {
    if (gameState.diceRollId === 0) return;
    handleDiceRollingChange(true);
    // Also bounds lazy loading and unavailable WebGL, before the scene mounts.
    const timer = setTimeout(() => handleDiceRollingChange(false), DICE_ROLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [gameState.diceRollId, handleDiceRollingChange]);

  useEffect(() => {
    if (diceAnimating) {
      if (wasMoving.current) callbacks.current.onMovementChange?.(false);
      wasMoving.current = false;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const targets = targetPositions;
    const isMovementPhase = gameState.turnPhase === 'MOVING';
    const rollId = gameState.diceRollId;

    const step = () => {
      const current = visualPositionsRef.current;
      let changed = false;
      const next = { ...current };

      for (const [id, target] of Object.entries(targets)) {
        const position = next[id];
        if (position === undefined) {
          next[id] = target;
          changed = true;
          continue;
        }
        if (position === target) continue;
        const forward = (target - position + gameState.tiles.length) % gameState.tiles.length;
        const isWalkingMove = forward <= 12;
        next[id] = isWalkingMove ? (position + 1) % gameState.tiles.length : target;
        if (isWalkingMove) callbacks.current.onMovementStep?.(next[id], id);
        changed = true;
      }

      if (changed) {
        visualPositionsRef.current = next;
        setVisualPositions(next);
        if (!wasMoving.current) {
          wasMoving.current = true;
          callbacks.current.onMovementChange?.(true);
        }
        // Wait beyond the final 220 ms token hop before acknowledging arrival.
        timer = setTimeout(step, TOKEN_STEP_MS);
      } else {
        const didMove = wasMoving.current;
        wasMoving.current = false;
        if (didMove) callbacks.current.onMovementChange?.(false);
        if (isMovementPhase && completedMovementRoll.current !== rollId) {
          completedMovementRoll.current = rollId;
          callbacks.current.onMovementComplete?.();
        }
      }
    };

    // Idle boards allocate no polling interval or animation timer.
    if (wasMoving.current || isMovementPhase || Object.entries(targets).some(([id, position]) => visualPositionsRef.current[id] !== position)) {
      timer = setTimeout(step, 0);
    }
    return () => clearTimeout(timer);
  }, [diceAnimating, gameState.diceRollId, gameState.tiles.length, gameState.turnPhase, targetPositions]);

  const visualPlayers = useMemo(() => players.map((player) => ({
    ...player,
    position: visualPositions[player.id] ?? player.position,
  })), [players, visualPositions]);
  const centerStatus = gameState.turnPhase === 'MOVING' ? 'Moving…' : 'Game in progress';
  const basicDice = <BasicDice values={gameState.diceValues} rolling={diceAnimating} />;
  const basicTokens = <BasicBoardTokens players={visualPlayers} />;

  return (
    <div className="board-grid" ref={boardElement}>
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
        {canRender3D ? <BoardSceneBoundary fallback={basicDice}>
          <Suspense fallback={basicDice}>
            <PhysicsDice
              values={gameState.diceValues}
              rollId={gameState.diceRollId}
              animate={diceAnimating}
              onRollingChange={handleDiceRollingChange}
            />
          </Suspense>
        </BoardSceneBoundary> : basicDice}
        <div className="dice-roll-btn" aria-live="polite">{centerStatus}</div>
      </div>

      {canRender3D ? <BoardSceneBoundary fallback={basicTokens}>
        <Suspense fallback={basicTokens}><BoardPiecesScene players={visualPlayers} /></Suspense>
      </BoardSceneBoundary> : basicTokens}
    </div>
  );
}
