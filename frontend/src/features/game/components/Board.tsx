import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, formatRM } from '../types/game.types';
import { COLOR_GROUP_PRESENTATION, getGridPosition } from '../config/board.presentation';
import { BOARD_REVEAL_LIMIT_MS, DICE_ROLL_LIMIT_MS, JAIL_TRANSFER_HOLD_MS, SCENE_FALLBACK_DELAY_MS, TOKEN_STEP_MS } from './board.animation';
import { BasicBoardTokens, BasicDice, BoardSceneBoundary, DelayedFallback, hasWebGL2 } from './BoardRendering';
import { loadTabletopScene } from './board.preload';
import type { CameraMode } from './tabletop/camera';
import { useHudInsets, usePrefersReducedMotion } from './tabletop/useViewportPreferences';
import './Board.css';

const TabletopScene = lazy(() => loadTabletopScene().then((module) => ({ default: module.TabletopScene })));

// Phases in which the landed space is the subject: the camera holds its arrival view.
const LANDING_PHASES = new Set([
  'MOVING', 'RESOLVE_TILE', 'BUY_DECISION', 'SMART_BUY_CHALLENGE', 'MATH_DUEL',
  'CARD_DRAW', 'CARD_MATH_CHALLENGE', 'JAIL_DECISION', 'JAIL_CHALLENGE',
]);
// After arriving, keep the close view this long into END_TURN before easing back out.
const END_TURN_LANDING_HOLD_MS = 1400;

interface Props {
  gameState: GameState;
  selectedTile: number;
  onTileSelect: (tileIndex: number) => void;
  onDiceRollingChange?: (rolling: boolean) => void;
  onMovementChange?: (isMoving: boolean) => void;
  onMovementStep?: (tileIndex: number, playerId: string) => void;
  onMovementComplete?: () => void;
  /** Called once, when the 3D dice and tokens have drawn (or the reveal limit passed). */
  onScenesReady?: () => void;
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
  onScenesReady,
}: Props) {
  const { players, properties } = gameState;
  const boardElement = useRef<HTMLDivElement>(null);
  const [canRender3D, setCanRender3D] = useState(hasWebGL2);
  const [diceSceneReady, setDiceSceneReady] = useState(false);
  const [tokenSceneReady, setTokenSceneReady] = useState(false);
  const [revealTimedOut, setRevealTimedOut] = useState(false);
  const handleDiceSceneReady = useCallback(() => setDiceSceneReady(true), []);
  const handleTokenSceneReady = useCallback(() => setTokenSceneReady(true), []);
  // Hold the reveal until the dice and tokens have both drawn, so it opens complete.
  const scenesVisible = !canRender3D || revealTimedOut || (diceSceneReady && tokenSceneReady);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.position]))
  );
  const visualPositionsRef = useRef(visualPositions);
  const wasMoving = useRef(false);
  const [settledRollId, setSettledRollId] = useState(0);
  const [moving, setMoving] = useState(false);
  // The roller's walk, for the "Tolak Towers · 2 of 6" label and step flashes.
  const [walk, setWalk] = useState<{ step: number; total: number; tile: number; id: number } | null>(null);
  const walkRef = useRef(walk);
  const [arrivalHeld, setArrivalHeld] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const insets = useHudInsets();
  const completedMovementRoll = useRef<number | null>(null);
  const diceStatus = useRef({ rollId: 0, rolling: false });
  const activeRollId = useRef(gameState.diceRollId);
  activeRollId.current = gameState.diceRollId;
  const callbacks = useRef({ onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete, onScenesReady });
  callbacks.current = { onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete, onScenesReady };
  const diceAnimating = gameState.diceRollId > 0 && settledRollId !== gameState.diceRollId;
  // Money and status broadcasts must not restart the current hop's timer.
  const targetPositionsJson = JSON.stringify(Object.fromEntries(players.map((player) => [player.id, player.position])));
  const targetPositions = useMemo<Record<string, number>>(() => JSON.parse(targetPositionsJson), [targetPositionsJson]);
  const jailIndex = gameState.tiles.findIndex((tile) => tile.type === 'JAIL');
  const jailedPlayerIds = players.filter((player) => player.isInJail).map((player) => player.id).join(',');
  const rollerId = players[gameState.currentPlayerIndex]?.id;

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

  useEffect(() => {
    if (scenesVisible) {
      callbacks.current.onScenesReady?.();
      return;
    }
    const timer = setTimeout(() => setRevealTimedOut(true), BOARD_REVEAL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [scenesVisible]);

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
      // A new roll must never freeze an earlier token mid-walk and resume it
      // alongside the roller. Settle everyone except the roller immediately.
      const current = visualPositionsRef.current;
      const settled = Object.fromEntries(Object.entries(targetPositions).map(([id, target]) =>
        [id, id === rollerId ? current[id] ?? target : target]));
      if (rollerId !== undefined && Object.entries(settled).some(([id, position]) => current[id] !== position)) {
        visualPositionsRef.current = settled;
        setVisualPositions(settled);
      }
      if (wasMoving.current) callbacks.current.onMovementChange?.(false);
      wasMoving.current = false;
      setMoving(false);
      walkRef.current = null;
      setWalk(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const targets = targetPositions;
    const isMovementPhase = gameState.turnPhase === 'MOVING';
    const rollId = gameState.diceRollId;
    const jailed = new Set(jailedPlayerIds.split(','));
    // "Go to jail" is a direct transfer, not a walk forward through Mula.
    const isJailTransfer = (id: string, target: number) =>
      jailIndex >= 0 && target === jailIndex && jailed.has(id) && visualPositionsRef.current[id] !== target;

    const step = () => {
      // Each new walk counts its steps from one.
      if (!wasMoving.current) walkRef.current = null;
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
        const isWalkingMove = forward <= 12 && !isJailTransfer(id, target);
        next[id] = isWalkingMove ? (position + 1) % gameState.tiles.length : target;
        if (isWalkingMove) callbacks.current.onMovementStep?.(next[id], id);
        if (id === rollerId) {
          const previous = walkRef.current;
          walkRef.current = {
            step: isWalkingMove ? (previous?.step ?? 0) + 1 : 0,
            total: isWalkingMove ? previous?.total || forward : 0,
            tile: next[id],
            id: (previous?.id ?? 0) + 1,
          };
          setWalk(walkRef.current);
        }
        changed = true;
      }

      if (changed) {
        visualPositionsRef.current = next;
        setVisualPositions(next);
        if (!wasMoving.current) {
          wasMoving.current = true;
          setMoving(true);
          setArrivalHeld(false);
          callbacks.current.onMovementChange?.(true);
        }
        // Wait beyond the final 220 ms token hop before acknowledging arrival.
        timer = setTimeout(step, TOKEN_STEP_MS);
      } else {
        const didMove = wasMoving.current;
        wasMoving.current = false;
        if (didMove) {
          setMoving(false);
          setArrivalHeld(true);
          callbacks.current.onMovementChange?.(false);
        }
        if (isMovementPhase && completedMovementRoll.current !== rollId) {
          completedMovementRoll.current = rollId;
          callbacks.current.onMovementComplete?.();
        }
      }
    };

    // Idle boards allocate no polling interval or animation timer.
    if (wasMoving.current || isMovementPhase || Object.entries(targets).some(([id, position]) => visualPositionsRef.current[id] !== position)) {
      // Let the token rest on "Ke Penjara" briefly so the jump reads as a jail transfer.
      const holdOnJailTile = Object.entries(targets).some(([id, target]) => isJailTransfer(id, target));
      timer = setTimeout(step, holdOnJailTile ? JAIL_TRANSFER_HOLD_MS : 0);
    }
    return () => clearTimeout(timer);
  }, [diceAnimating, gameState.diceRollId, gameState.tiles.length, gameState.turnPhase, jailIndex, jailedPlayerIds, rollerId, targetPositions]);

  // The arrival view stays until the turn moves on, or briefly into END_TURN.
  const turnPhase = gameState.turnPhase;
  useEffect(() => {
    setArrivalHeld(false);
    walkRef.current = null;
    setWalk(null);
  }, [rollerId]);
  useEffect(() => {
    if (turnPhase === 'ROLL_PHASE') setArrivalHeld(false);
    if (turnPhase !== 'END_TURN') return;
    const timer = setTimeout(() => setArrivalHeld(false), END_TURN_LANDING_HOLD_MS);
    return () => clearTimeout(timer);
  }, [turnPhase]);

  const cameraMode: CameraMode = reducedMotion ? 'overview'
    : diceAnimating ? 'dice'
      : moving ? 'follow'
        : arrivalHeld || LANDING_PHASES.has(turnPhase) ? 'landing'
          : 'overview';

  const visualPlayers = useMemo(() => players.map((player) => ({
    ...player,
    position: visualPositions[player.id] ?? player.position,
  })), [players, visualPositions]);
  const roller = visualPlayers[gameState.currentPlayerIndex];
  const centerStatus = gameState.turnPhase === 'MOVING' ? 'Moving…' : 'Game in progress';
  const basicDice = <BasicDice values={gameState.diceValues} rolling={diceAnimating} />;
  const basicTokens = <BasicBoardTokens players={visualPlayers} />;
  const routeLabel = moving && walk && walk.total > 0
    ? `${gameState.tiles[walk.tile]?.name ?? ''} · ${walk.step} of ${walk.total}`
    : !moving && cameraMode === 'landing' && roller
      ? `${roller.isInJail ? 'In' : 'Landed on'} ${gameState.tiles[roller.position]?.name ?? ''}`
      : null;
  const stepTile = useMemo(() => walk && walk.step > 0 ? { index: walk.tile, id: walk.id } : null, [walk]);
  const dice = useMemo(() => ({
    values: gameState.diceValues,
    rollId: gameState.diceRollId,
    animate: diceAnimating,
    onRollingChange: handleDiceRollingChange,
    onReady: handleDiceSceneReady,
  }), [diceAnimating, gameState.diceRollId, gameState.diceValues, handleDiceRollingChange, handleDiceSceneReady]);

  const basicBoard = (
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
        {basicDice}
        <div className="dice-roll-btn" aria-live="polite">{centerStatus}</div>
      </div>
      {basicTokens}
    </div>
  );

  return (
    <div
      className={`board-stage${canRender3D ? ' board-stage--3d' : ' board-stage--basic'}${scenesVisible ? '' : ' board-stage--scenes-pending'}`}
      ref={boardElement}
    >
      {canRender3D ? (
        <BoardSceneBoundary fallback={basicBoard}>
          <Suspense fallback={<DelayedFallback delayMs={SCENE_FALLBACK_DELAY_MS}>{basicBoard}</DelayedFallback>}>
            <TabletopScene
              players={visualPlayers}
              tiles={gameState.tiles}
              properties={properties}
              currentPlayerIndex={gameState.currentPlayerIndex}
              selectedTile={selectedTile}
              stepTile={stepTile}
              dice={dice}
              cameraMode={cameraMode}
              insets={insets}
              reducedMotion={reducedMotion}
              onTileSelect={onTileSelect}
              onReady={handleTokenSceneReady}
            />
          </Suspense>
          {/* Keyboard and screen-reader access to every space; the 3D board itself is pointer-only. */}
          <nav className="board-space-list" aria-label="Board spaces">
            {gameState.tiles.map((tile) => (
              <button key={tile.index} type="button" onClick={() => onTileSelect(tile.index)} aria-pressed={selectedTile === tile.index}>
                View {tile.name}
              </button>
            ))}
          </nav>
          <span className="sr-only" aria-live="polite">
            {diceAnimating ? 'Rolling the dice' : `Dice showing ${gameState.diceValues.join(' and ')}`}
          </span>
        </BoardSceneBoundary>
      ) : basicBoard}
      {routeLabel && canRender3D && (
        <div className={`board-route-label${moving ? '' : ' board-route-label--landed'}`} aria-live="polite">
          {routeLabel}
        </div>
      )}
    </div>
  );
}
