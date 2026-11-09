import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Player } from '../../types/game.types';
import { rotateOffset, tilePlacement, tokenSpot } from '../tabletop/board.layout';
import { PIECE } from './FlatPieces';
import { landingCard, type FlatFrame } from './flat.layout';

/**
 * The flat board's landing close-up. Where the 3D camera moves in on a landed
 * space, the board here stays still: the space (marked on the board by its
 * gold lift) appears large and upright in the middle of the screen, with the
 * pieces standing on it, and fades away when the 3D camera would pull out.
 * Only this card animates, so the close-up costs almost nothing to draw.
 */
export function FlatLanding({ index, open, faces, players, frame, stage }: {
  /** The landed space, or null. */
  index: number | null;
  /** Shown close up: the 3D table's landing moment. */
  open: boolean;
  faces: Map<number, HTMLCanvasElement>;
  players: Player[];
  frame: FlatFrame;
  stage: { width: number; height: number };
}) {
  // The last space stays mounted while it fades away.
  const [shown, setShown] = useState<number | null>(index);
  useEffect(() => { if (index !== null) setShown(index); }, [index]);
  const face = shown !== null ? faces.get(shown) : undefined;
  if (shown === null || !face || stage.width <= 0) return null;

  const card = landingCard(frame, stage.width, stage.height, shown);
  const place = tilePlacement(shown);
  const here = players.filter((player) => !player.isBankrupt && player.position === shown);
  const isOpen = open && index === shown;

  return (
    <div
      className={`flat-landing${isOpen ? ' flat-landing--open' : ''}`}
      style={{ width: card.width, height: card.height, marginLeft: -card.width / 2, marginTop: -card.height / 2, transform: isOpen ? card.open : card.closed }}
      aria-hidden="true"
    >
      <LandingFace face={face} width={card.width} height={card.height} />
      {here.map((player, slot) => {
        // The piece's spot on this space, in the space's own upright frame.
        const [spotX, spotZ] = tokenSpot(shown, slot, here.length);
        const [x, z] = rotateOffset(spotX - place.x, spotZ - place.z, -place.yaw);
        const left = card.width / 2 + x * card.unit;
        const top = card.height / 2 + z * card.unit;
        const ring = PIECE.ring.radius * 2 * card.unit;
        const body = PIECE.body * card.unit;
        return (
          <span key={player.id}>
            <span
              className="flat-landing__ring"
              style={{ left: left - ring / 2, top: top - ring / 2, width: ring, height: ring, borderWidth: PIECE.ring.width * card.unit, borderColor: player.color }}
            />
            <img
              className="flat-landing__piece"
              src={`/tokens/${player.tokenType}.webp`}
              alt=""
              draggable={false}
              style={{ left: left - PIECE.anchor.x * body, top: top - PIECE.anchor.y * body, width: body, height: body }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Room round the card for its glow and shadow, in CSS pixels. */
const GLOW = 28;

/**
 * The close-up's printed face with its gold edge, glow and shadow drawn in
 * once: live CSS shadows would be recalculated on every frame it grows.
 */
function LandingFace({ face, width, height }: { face: HTMLCanvasElement; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round((width + GLOW * 2) * ratio);
    element.height = Math.round((height + GLOW * 2) * ratio);
    const context = element.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.translate(GLOW, GLOW);
    context.imageSmoothingQuality = 'high';
    const edge = { x: 0, y: 0, w: width, h: height, r: 6 };
    // A drop shadow below, then a warm gold glow all round, then the face and its gold border.
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.4)';
    context.shadowBlur = 24;
    context.shadowOffsetY = 12;
    context.fillStyle = '#ffbd19';
    context.beginPath();
    context.roundRect(edge.x, edge.y, edge.w, edge.h, edge.r);
    context.fill();
    context.shadowColor = 'rgba(255, 189, 25, 0.55)';
    context.shadowBlur = 22;
    context.shadowOffsetY = 0;
    context.fill();
    context.restore();
    const border = 4;
    context.drawImage(face, border, border, width - border * 2, height - border * 2);
  }, [face, width, height]);
  return (
    <canvas
      ref={canvas}
      className="flat-landing__face"
      style={{ left: -GLOW, top: -GLOW, width: width + GLOW * 2, height: height + GLOW * 2 }}
      aria-hidden="true"
    />
  );
}
