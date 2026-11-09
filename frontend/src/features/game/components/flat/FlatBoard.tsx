import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { COLOR_GROUP_PRESENTATION } from '../../config/board.presentation';
import type { BoardDice, BoardViewProps } from '../board.types';
import { BasicDice, BoardSceneBoundary } from '../BoardRendering';
import { STEP_FLASH_SECONDS } from '../board.animation';
import { drawCardBack, drawCentre, drawTileFace } from '../tabletop/board.art';
import {
  BAND_DEPTH, BOARD_EDGE, CARD_SIZE, CENTRE_SIZE, DECK_SCALE, DECK_SPOT, rotateOffset, TILE_GAP, tilePlacement,
} from '../tabletop/board.layout';
import type { CameraMode } from '../tabletop/camera';
import { ArtCanvas } from './ArtCanvas';
import { FlatCardDraw } from './FlatCardDraw';
import { FlatLanding } from './FlatLanding';
import { FlatPieces } from './FlatPieces';
import { flatFrame, patchStyle, toPixels, toStage, type FlatFrame } from './flat.layout';
import './FlatBoard.css';

const FlatDice = lazy(() => import('./FlatDice').then((module) => ({ default: module.FlatDice })));

/**
 * The dice tray's view over the centre, in board units: the dice come out
 * about two thirds of a unit across, as on the 3D board.
 */
const DICE_VIEW = { width: 4.6, depth: 2.9 };
/** Room round the board, in board units, for its shadow on the felt. */
const SHADOW_MARGIN = 1;

export interface FlatBoardProps extends BoardViewProps {
  /** Draw the dice in 3D (in a small view of their own), or flat when the browser has no 3D. */
  dice3D: boolean;
  /** The 3D table's camera moment: its landing close-up is shown here as the landed space coming up. */
  cameraMode: CameraMode;
}

/**
 * The flat board: the 3D table seen straight from above, for computers that
 * cannot draw 3D quickly. It shows the same printed board, the same pieces and
 * dice and the same card draw, and follows the same timings, so a turn plays
 * out exactly as on the 3D table. It never moves as a whole, so the browser
 * only redraws the small parts that change and keeps a full frame rate.
 */
export function FlatBoard(props: FlatBoardProps) {
  const { tiles, players, properties, highlightTile, stepTile, cardDraw, onTileSelect, onReady } = props;
  const root = useRef<HTMLDivElement>(null);
  const print = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0, left: 0, top: 0 });

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const width = box.width || window.innerWidth;
      const height = box.height || window.innerHeight;
      setStage((previous) => previous.width === width && previous.height === height && previous.left === box.left && previous.top === box.top
        ? previous : { width, height, left: box.left, top: box.top });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frame = useMemo(() => flatFrame(stage.width, stage.height), [stage.width, stage.height]);

  // Names and prices are fixed for the match: the artwork is drawn once. Every
  // game update brings a fresh copy of the spaces, so only a real change counts.
  const faceKey = JSON.stringify(tiles.map((tile) => [tile.index, tile.type, tile.name, tile.price, tile.colorGroup, tile.skillTheme]));
  const art = useMemo(() => ({
    spaces: tiles,
    faces: new Map(tiles.map((tile) => [tile.index, drawTileFace({
      tile,
      corner: tilePlacement(tile.index).corner,
      groupColour: tile.colorGroup ? COLOR_GROUP_PRESENTATION[tile.colorGroup] ?? null : null,
    })])),
    centre: drawCentre(),
    cardBack: drawCardBack(),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [faceKey]);

  // The printed board, drawn as one picture whenever its size changes.
  useLayoutEffect(() => {
    const canvas = print.current;
    if (!canvas || frame.size <= 0) return;
    // A margin round the board holds its shadow on the felt, drawn in once:
    // a live CSS shadow would cost a redraw of its whole area.
    const margin = SHADOW_MARGIN * frame.unit;
    const outer = frame.size + margin * 2;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / outer);
    canvas.width = Math.round(outer * ratio);
    canvas.height = Math.round(outer * ratio);
    Object.assign(canvas.style, { left: `${-margin}px`, top: `${-margin}px`, width: `${outer}px`, height: `${outer}px` });
    const context = canvas.getContext('2d');
    if (!context) return;
    const unit = frame.unit * ratio;
    context.imageSmoothingQuality = 'high';
    context.translate(margin * ratio, margin * ratio);
    // A slim dark board, casting a soft shadow; it shows between the spaces as the printed rule lines.
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = 0.5 * unit;
    context.shadowOffsetY = 0.18 * unit;
    context.fillStyle = '#17201b';
    context.beginPath();
    context.roundRect(0, 0, BOARD_EDGE * unit, BOARD_EDGE * unit, 0.08 * unit);
    context.fill();
    context.restore();
    const field = CENTRE_SIZE - TILE_GAP;
    const middle = (BOARD_EDGE / 2) * unit;
    context.drawImage(art.centre, middle - (field / 2) * unit, middle - (field / 2) * unit, field * unit, field * unit);
    for (const tile of art.spaces) {
      const place = tilePlacement(tile.index);
      const face = art.faces.get(tile.index);
      if (!face) continue;
      const width = (place.width - TILE_GAP) * unit;
      const depth = (place.depth - TILE_GAP) * unit;
      context.save();
      context.translate((place.x + BOARD_EDGE / 2) * unit, (place.z + BOARD_EDGE / 2) * unit);
      context.rotate(-place.yaw);
      context.drawImage(face, -width / 2, -depth / 2, width, depth);
      context.restore();
    }
  }, [art, frame.size, frame.unit]);

  // Ready once the board has been drawn and shown for a frame.
  const reported = useRef(false);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  useEffect(() => {
    if (reported.current || frame.size <= 0) return;
    const handle = requestAnimationFrame(() => {
      reported.current = true;
      readyCallback.current();
    });
    return () => cancelAnimationFrame(handle);
  }, [frame.size]);

  const ownership = useMemo(() => new Map(properties.map((property) => [property.tileIndex, {
    colour: players.find((player) => player.id === property.ownerId)?.color ?? null,
    house: property.isLeveledUp,
  }])), [players, properties]);

  // The lifted space keeps showing while it sinks back down.
  const [shownLift, setShownLift] = useState<number | null>(highlightTile);
  useEffect(() => { if (highlightTile !== null) setShownLift(highlightTile); }, [highlightTile]);

  // Where the card draw starts: the deck, on the still board.
  const deckView = useMemo(() => ({
    project: (x: number, z: number) => toStage(frame, x, z),
    unit: () => frame.unit,
  }), [frame]);

  const unit = frame.unit;
  const deck = toPixels(frame, DECK_SPOT.x, DECK_SPOT.z);
  const deckWidth = CARD_SIZE.width * DECK_SCALE * unit;
  const deckHeight = CARD_SIZE.depth * DECK_SCALE * unit;

  return (
    <div ref={root} className="flat-table">
      {frame.size > 0 && stage.width > 0 && (
        <div
          className="flat-board"
          style={{ left: frame.left, top: frame.top, width: frame.size, height: frame.size, '--u': `${unit}px` } as CSSProperties}
        >
          <canvas ref={print} className="flat-board__print" aria-hidden="true" />

          {tiles.map((tile) => {
            const place = tilePlacement(tile.index);
            const width = place.width - TILE_GAP;
            const depth = place.depth - TILE_GAP;
            const owned = ownership.get(tile.index);
            const [stripX, stripZ] = offset(place, 0, depth / 2 - 0.13);
            const [houseX, houseZ] = offset(place, 0, -depth / 2 + BAND_DEPTH / 2);
            return (
              <span key={tile.index}>
                <button
                  type="button"
                  className="flat-space-button"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={patchStyle(frame, place.x, place.z, width, depth, place.yaw)}
                  onClick={() => onTileSelect(tile.index)}
                />
                {owned?.colour && (
                  <span
                    className="flat-owner"
                    style={{ ...patchStyle(frame, stripX, stripZ, width - 0.16, 0.14, place.yaw), background: owned.colour }}
                  />
                )}
                {owned?.house && <HouseMark style={patchStyle(frame, houseX, houseZ, 0.42, 0.42, place.yaw)} />}
              </span>
            );
          })}

          {stepTile && <StepFlash key={stepTile.id} index={stepTile.index} frame={frame} />}

          {shownLift !== null && art.faces.get(shownLift) && (() => {
            const place = tilePlacement(shownLift);
            const width = place.width - TILE_GAP;
            const depth = place.depth - TILE_GAP;
            return (
              <div
                className={`flat-lift${highlightTile === shownLift ? ' flat-lift--raised' : ''}`}
                style={patchStyle(frame, place.x, place.z, width, depth, place.yaw)}
              >
                <ArtCanvas source={art.faces.get(shownLift)!} width={width * unit} height={depth * unit} />
              </div>
            );
          })()}

          <div
            className="flat-deck"
            style={{ left: deck[0] - deckWidth / 2, top: deck[1] - deckHeight / 2, width: deckWidth, height: deckHeight, transform: `rotate(${-DECK_SPOT.yaw}rad)` }}
          >
            <ArtCanvas source={art.cardBack} width={deckWidth} height={deckHeight} />
          </div>

          <div className="flat-dice" style={patchStyle(frame, 0, 0, DICE_VIEW.width, DICE_VIEW.depth)}>
            {props.dice3D ? (
              <BoardSceneBoundary fallback={<FlatBasicDice dice={props.dice} />}>
                <Suspense fallback={null}>
                  <FlatDice dice={props.dice} />
                </Suspense>
              </BoardSceneBoundary>
            ) : <FlatBasicDice dice={props.dice} />}
          </div>

          <FlatPieces players={players} currentPlayerIndex={props.currentPlayerIndex} frame={frame} />
        </div>
      )}
      {frame.size > 0 && stage.width > 0 && (
        <FlatLanding
          index={props.cameraMode === 'landing' ? highlightTile : null}
          open={props.cameraMode === 'landing' && highlightTile !== null}
          faces={art.faces}
          players={players}
          frame={frame}
          stage={stage}
        />
      )}
      {cardDraw && frame.size > 0 && (
        <FlatCardDraw key={cardDraw.id} draw={cardDraw} back={art.cardBack} deck={deckView} stage={stage} insets={props.insets} />
      )}
    </div>
  );
}

/** A point on a space, given in the space's own frame (x along it, z outwards). */
function offset(place: ReturnType<typeof tilePlacement>, x: number, z: number): [number, number] {
  const [dx, dz] = rotateOffset(x, z, place.yaw);
  return [place.x + dx, place.z + dz];
}

function StepFlash({ index, frame }: { index: number; frame: FlatFrame }) {
  const place = tilePlacement(index);
  return (
    <span
      className="flat-step"
      style={{ ...patchStyle(frame, place.x, place.z, place.width - TILE_GAP, place.depth - TILE_GAP, place.yaw), animationDuration: `${STEP_FLASH_SECONDS}s` }}
    />
  );
}

/** The green house built on a space, as seen from above the table. */
function HouseMark({ style }: { style: CSSProperties }) {
  return (
    <svg className="flat-house" style={style} viewBox="0 0 40 40" aria-label="House built" role="img">
      <path d="M6 20 L20 7 L34 20 Z" fill="#17824a" stroke="#0b3d22" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="19" width="20" height="15" fill="#1f9d55" stroke="#0b3d22" strokeWidth="2" />
      <rect x="18" y="25" width="5" height="9" fill="#e7f5ec" />
    </svg>
  );
}

/**
 * Flat dice for a browser with no 3D at all. A roll lasts as long as the
 * recorded throw the 3D dice would play, so the turn keeps the same pace.
 */
function FlatBasicDice({ dice }: { dice: BoardDice }) {
  const callbacks = useRef(dice);
  callbacks.current = dice;
  useEffect(() => { callbacks.current.onReady(); }, []);
  const { rollId, values, animate } = dice;
  useEffect(() => {
    if (rollId === 0 || !animate) return;
    callbacks.current.onRollingChange(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void import('../dice.throw').then(({ buildThrowPlan, throwDurationMs, throwSeed }) => {
      if (cancelled) return;
      const plan = buildThrowPlan(rollId, throwSeed(rollId, values), values.filter((value) => value >= 1 && value <= 6));
      timer = setTimeout(() => callbacks.current.onRollingChange(false), throwDurationMs(plan.recording));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // A roll is identified by its id; its values arrive with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId, animate]);
  return <BasicDice values={values} rolling={animate} />;
}
