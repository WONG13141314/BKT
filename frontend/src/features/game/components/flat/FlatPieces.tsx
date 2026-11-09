import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Player } from '../../types/game.types';
import {
  hopFrame, landingSquash, TOKEN_HOP_HEIGHT, TOKEN_HOP_SECONDS, TOKEN_JUMP_HEIGHT, TOKEN_JUMP_SECONDS, TURN_HOP,
} from '../board.animation';
import { forwardSteps, tokenSpot } from '../tabletop/board.layout';
import { toPixels, type FlatFrame } from './flat.layout';

/**
 * Sizes in board units. The token pictures leave a margin around the model:
 * the piece itself fills about 70% of the picture's width, with its base 78%
 * of the way down, so it stands centred on its spot.
 */
export const PIECE = {
  body: 1.25,
  anchor: { x: 0.55, y: 0.78 },
  shadow: { width: 0.82, depth: 0.42 },
  ring: { radius: 0.38, width: 0.05 },
} as const;
const BODY = PIECE.body;
const BODY_ANCHOR = PIECE.anchor;
const SHADOW = PIECE.shadow;
const RING = PIECE.ring;
/** A hop rises towards the viewer: shown as moving up the screen and growing. */
const HOP_RISE = 0.6;
const HOP_GROWTH = 0.18;

interface PieceState {
  index: number;
  from: [number, number];
  to: [number, number];
  live: [number, number];
  /** When the current hop began, or −1. */
  start: number;
  duration: number;
  height: number;
  lastHop: number;
}

interface PieceNodes {
  root: HTMLDivElement | null;
  body: HTMLImageElement | null;
  shadow: HTMLDivElement | null;
}

/**
 * The players' pieces on the flat board. They stand on the same spots as the
 * 3D pieces and hop with the same timings: one space per hop when walking, an
 * arc straight across for card moves and jail, and a small hello hop when a
 * turn begins. Frames are drawn only while a piece is moving.
 */
export function FlatPieces({ players, currentPlayerIndex, frame }: {
  players: Player[];
  currentPlayerIndex: number;
  frame: FlatFrame;
}) {
  const states = useRef(new Map<string, PieceState>());
  const nodes = useRef(new Map<string, PieceNodes>());
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const loop = useRef(0);
  const lastTick = useRef(0);
  const lastActive = useRef<string | undefined>(undefined);
  const activeId = players[currentPlayerIndex]?.id;
  const standing = useMemo(() => players.filter((player) => !player.isBankrupt), [players]);

  // Which pieces share a space, so each can step aside for the others.
  const spots = useMemo(() => {
    const byTile = new Map<number, string[]>();
    standing.forEach((player) => byTile.set(player.position, [...(byTile.get(player.position) ?? []), player.id]));
    const result = new Map<string, [number, number]>();
    for (const [tile, ids] of byTile) ids.forEach((id, slot) => result.set(id, tokenSpot(tile, slot, ids.length)));
    return result;
  }, [standing]);

  useLayoutEffect(() => {
    const now = performance.now();
    const seen = new Set<string>();
    for (const player of standing) {
      seen.add(player.id);
      const spot = spots.get(player.id) ?? tokenSpot(player.position, 0, 1);
      let state = states.current.get(player.id);
      if (!state) {
        state = { index: player.position, from: [...spot], to: [...spot], live: [...spot], start: -1, duration: 0, height: 0, lastHop: -Infinity };
        states.current.set(player.id, state);
      }
      if (state.index !== player.position) {
        // Ordinary moves hop one space; card moves and jail transfers arc straight across.
        const walk = forwardSteps(state.index, player.position) === 1;
        state.from = [...state.live];
        state.duration = walk ? TOKEN_HOP_SECONDS : TOKEN_JUMP_SECONDS;
        state.height = walk ? TOKEN_HOP_HEIGHT : TOKEN_JUMP_HEIGHT;
        state.start = now;
        state.index = player.position;
      }
      state.to = [...spot];
      if (player.id === activeId && lastActive.current !== activeId && lastActive.current !== undefined && state.start < 0) {
        state.from = [...state.live];
        state.duration = TURN_HOP.seconds;
        state.height = TURN_HOP.height;
        state.start = now;
      }
    }
    for (const id of [...states.current.keys()]) if (!seen.has(id)) states.current.delete(id);
    lastActive.current = activeId;

    const draw = (time: number): boolean => {
      const delta = lastTick.current ? Math.min((time - lastTick.current) / 1000, 0.1) : 0;
      lastTick.current = time;
      const unit = frameRef.current.unit;
      let moving = false;
      for (const [id, state] of states.current) {
        let lift = 0;
        let stretch: number;
        if (state.start >= 0) {
          const t = Math.min(1, (time - state.start) / (state.duration * 1000));
          const hop = hopFrame(t, state.height);
          state.live = [
            state.from[0] + (state.to[0] - state.from[0]) * hop.along,
            state.from[1] + (state.to[1] - state.from[1]) * hop.along,
          ];
          lift = hop.lift;
          stretch = hop.stretch;
          if (t >= 1) {
            state.start = -1;
            state.lastHop = time;
          }
          moving = true;
        } else {
          // Stepping aside for a piece that arrives on the same space.
          const k = 1 - Math.exp(-delta * 12);
          state.live = [state.live[0] + (state.to[0] - state.live[0]) * k, state.live[1] + (state.to[1] - state.live[1]) * k];
          if (Math.hypot(state.to[0] - state.live[0], state.to[1] - state.live[1]) > 1e-3) moving = true;
          else state.live = [...state.to];
          stretch = landingSquash(time - state.lastHop);
          if (stretch !== 1) moving = true;
        }
        const node = nodes.current.get(id);
        if (!node?.root) continue;
        const [left, top] = toPixels(frameRef.current, state.live[0], state.live[1]);
        node.root.style.transform = `translate(${left}px, ${top}px)`;
        // Nearer the bottom of the board is nearer the viewer: drawn on top.
        node.root.style.zIndex = String(Math.round(state.live[1] * 10 + 100));
        if (node.body) {
          const grow = 1 + lift * HOP_GROWTH;
          node.body.style.transform = `translateY(${-lift * HOP_RISE * unit}px) scale(${grow / Math.sqrt(stretch)}, ${grow * stretch})`;
        }
        if (node.shadow) {
          node.shadow.style.transform = `scale(${1 - lift * 0.25})`;
          node.shadow.style.opacity = String(1 - lift * 0.35);
        }
      }
      return moving;
    };

    cancelAnimationFrame(loop.current);
    lastTick.current = 0;
    const tick = (time: number) => {
      loop.current = draw(time) ? requestAnimationFrame(tick) : 0;
    };
    draw(performance.now());
    loop.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loop.current);
  }, [standing, spots, activeId, frame]);

  const unit = frame.unit;
  return (
    <>
      {standing.map((player) => {
        const active = player.id === activeId;
        const ring = RING.radius * 2 * unit;
        return (
          <div
            key={player.id}
            className="flat-piece"
            ref={(root) => { nodes.current.set(player.id, { ...nodes.current.get(player.id), root } as PieceNodes); }}
            role="img"
            aria-label={`${player.name} on space ${player.position}`}
          >
            <div
              className="flat-piece__shadow"
              ref={(shadow) => { nodes.current.set(player.id, { ...nodes.current.get(player.id), shadow } as PieceNodes); }}
              style={{ width: SHADOW.width * unit, height: SHADOW.depth * unit, marginLeft: -SHADOW.width * unit / 2, marginTop: -SHADOW.depth * unit / 2 }}
            />
            <div
              className={`flat-piece__ring${active ? ' flat-piece__ring--active' : ''}`}
              style={{
                width: ring, height: ring, marginLeft: -ring / 2, marginTop: -ring / 2,
                borderWidth: RING.width * unit, borderColor: player.color,
                boxShadow: active ? `0 0 ${0.18 * unit}px ${player.color}` : undefined,
              }}
            />
            <img
              className="flat-piece__body"
              ref={(body) => { nodes.current.set(player.id, { ...nodes.current.get(player.id), body } as PieceNodes); }}
              src={`/tokens/${player.tokenType}.webp`}
              alt=""
              draggable={false}
              style={{
                width: BODY * unit, height: BODY * unit,
                marginLeft: -BODY_ANCHOR.x * BODY * unit, marginTop: -BODY_ANCHOR.y * BODY * unit,
                transformOrigin: `${BODY_ANCHOR.x * 100}% ${BODY_ANCHOR.y * 100}%`,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
