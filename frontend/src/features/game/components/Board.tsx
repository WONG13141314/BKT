import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState } from '../types/game.types';
import { BOARD_REVEAL_LIMIT_MS, DICE_ROLL_LIMIT_MS, JAIL_TRANSFER_HOLD_MS, SCENE_FALLBACK_DELAY_MS, TOKEN_STEP_MS } from './board.animation';
import { BoardSceneBoundary, DelayedFallback, graphicsSupport } from './BoardRendering';
import { loadTabletopScene } from './board.preload';
import { FlatBoard } from './flat/FlatBoard';
import type { CameraMode } from './tabletop/camera';
import type { TableCardDraw } from './board.types';
import { useHudInsets } from './tabletop/useViewportPreferences';
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
  /** The route line ("Tolak Lane · 2 of 6", "Landed on …") for the turn banner to show. */
  onRouteChange?: (route: { label: string | null; moving: boolean }) => void;
  /** A Challenge Card being drawn from the deck on the board. */
  cardDraw?: TableCardDraw | null;
}

export function Board({
  gameState,
  selectedTile,
  onTileSelect,
  onDiceRollingChange,
  onMovementChange,
  onMovementStep,
  onMovementComplete,
  onScenesReady,
  onRouteChange,
  cardDraw = null,
}: Props) {
  const { players, properties } = gameState;
  const boardElement = useRef<HTMLDivElement>(null);
  // The 3D table needs the graphics chip. Without it (acceleration turned off,
  // or no 3D at all) the flat board plays the same game; it keeps 3D dice
  // whenever the browser can draw 3D at all.
  const [support] = useState(graphicsSupport);
  const [use3D, setUse3D] = useState(support === 'hardware');
  const [dice3D, setDice3D] = useState(support !== 'none');
  const [diceSceneReady, setDiceSceneReady] = useState(false);
  const [tokenSceneReady, setTokenSceneReady] = useState(false);
  const [revealTimedOut, setRevealTimedOut] = useState(false);
  const handleDiceSceneReady = useCallback(() => setDiceSceneReady(true), []);
  const handleTokenSceneReady = useCallback(() => setTokenSceneReady(true), []);
  // Hold the reveal until the dice and the board have both drawn, so it opens complete.
  const scenesVisible = revealTimedOut || (diceSceneReady && tokenSceneReady);
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
  const insets = useHudInsets();
  const completedMovementRoll = useRef<number | null>(null);
  const diceStatus = useRef({ rollId: 0, rolling: false });
  const activeRollId = useRef(gameState.diceRollId);
  activeRollId.current = gameState.diceRollId;
  const callbacks = useRef({ onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete, onScenesReady, onRouteChange });
  callbacks.current = { onDiceRollingChange, onMovementChange, onMovementStep, onMovementComplete, onScenesReady, onRouteChange };
  const diceAnimating = gameState.diceRollId > 0 && settledRollId !== gameState.diceRollId;
  // Money and status broadcasts must not restart the current hop's timer.
  const targetPositionsJson = JSON.stringify(Object.fromEntries(players.map((player) => [player.id, player.position])));
  const targetPositions = useMemo<Record<string, number>>(() => JSON.parse(targetPositionsJson), [targetPositionsJson]);
  const jailIndex = gameState.tiles.findIndex((tile) => tile.type === 'JAIL');
  const jailedPlayerIds = players.filter((player) => player.isInJail).map((player) => player.id).join(',');
  const rollerId = players[gameState.currentPlayerIndex]?.id;

  // Without the graphics chip, a blurred backdrop behind a panel is redrawn on
  // every frame anything beneath it changes (11 fps behind the question window,
  // measured). The flat board marks the page so those panels skip the blur.
  useEffect(() => {
    if (use3D) return;
    document.documentElement.classList.add('flat-graphics');
    return () => document.documentElement.classList.remove('flat-graphics');
  }, [use3D]);

  useEffect(() => {
    const board = boardElement.current;
    if (!board || (!use3D && !dice3D)) return;
    // A lost graphics context: carry on with the flat board and flat dice.
    const useFlatBoard = () => {
      setUse3D(false);
      setDice3D(false);
    };
    // Capture non-bubbling WebGL events from any canvas on the board.
    board.addEventListener('webglcontextlost', useFlatBoard, true);
    board.addEventListener('webglcontextcreationerror', useFlatBoard, true);
    return () => {
      board.removeEventListener('webglcontextlost', useFlatBoard, true);
      board.removeEventListener('webglcontextcreationerror', useFlatBoard, true);
    };
  }, [use3D, dice3D]);

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

  // Every screen gets the same camera, whatever the system's motion setting.
  const cameraMode: CameraMode = diceAnimating ? 'dice'
      : cardDraw && !moving ? 'deck'
      : moving ? 'follow'
        : arrivalHeld || LANDING_PHASES.has(turnPhase) ? 'landing'
          : 'overview';

  const visualPlayers = useMemo(() => players.map((player) => ({
    ...player,
    position: visualPositions[player.id] ?? player.position,
  })), [players, visualPositions]);
  const roller = visualPlayers[gameState.currentPlayerIndex];
  const routeLabel = moving && walk && walk.total > 0
    ? `${gameState.tiles[walk.tile]?.name ?? ''} · ${walk.step} of ${walk.total}`
    : !moving && cameraMode === 'landing' && roller
      ? `${roller.isInJail ? 'In' : 'Landed on'} ${gameState.tiles[roller.position]?.name ?? ''}`
      : null;
  // The turn banner shows the route line, so the board draws no label of its own.
  useEffect(() => {
    callbacks.current.onRouteChange?.({ label: routeLabel, moving });
  }, [routeLabel, moving]);
  const stepTile = useMemo(() => walk && walk.step > 0 ? { index: walk.tile, id: walk.id } : null, [walk]);
  const dice = useMemo(() => ({
    values: gameState.diceValues,
    rollId: gameState.diceRollId,
    animate: diceAnimating,
    onRollingChange: handleDiceRollingChange,
    onReady: handleDiceSceneReady,
  }), [diceAnimating, gameState.diceRollId, gameState.diceValues, handleDiceRollingChange, handleDiceSceneReady]);

  const view = {
    players: visualPlayers,
    tiles: gameState.tiles,
    properties,
    currentPlayerIndex: gameState.currentPlayerIndex,
    highlightTile: moving || diceAnimating ? null : selectedTile,
    stepTile,
    dice,
    insets,
    onTileSelect,
    onReady: handleTokenSceneReady,
    cardDraw,
  };
  const flatBoard = <FlatBoard {...view} dice3D={dice3D} cameraMode={cameraMode} />;

  return (
    <div
      className={`board-stage${use3D ? ' board-stage--3d' : ' board-stage--flat'}${scenesVisible ? '' : ' board-stage--scenes-pending'}`}
      ref={boardElement}
    >
      {use3D ? (
        <BoardSceneBoundary fallback={flatBoard}>
          <Suspense fallback={<DelayedFallback delayMs={SCENE_FALLBACK_DELAY_MS}>{flatBoard}</DelayedFallback>}>
            <TabletopScene
              {...view}
              destination={rollerId !== undefined ? targetPositions[rollerId] ?? null : null}
              cameraMode={cameraMode}
            />
          </Suspense>
        </BoardSceneBoundary>
      ) : flatBoard}
      {/* Keyboard and screen-reader access to every space; both boards are pointer-only. */}
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
    </div>
  );
}
