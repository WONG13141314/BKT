import type { CSSProperties } from 'react';
import type { SafeInsets } from '../tabletop/camera';
import { BOARD_EDGE, TILE_GAP, tilePlacement } from '../tabletop/board.layout';
import { hudInsets } from '../tabletop/useViewportPreferences';

/**
 * The flat board is the 3D board seen straight from above: the same layout in
 * the same board units (x to the right, z down the screen), mapped onto a
 * square of `size` pixels at (`left`, `top`) on the stage. It never moves, so
 * the browser only redraws what changes on it (a piece, the dice, a flash),
 * which keeps it at full frame rate without the graphics chip.
 */
export interface FlatFrame {
  /** Pixels per board unit. */
  unit: number;
  size: number;
  left: number;
  top: number;
}

/**
 * The screen edges the interface's panels take, matching GamePage.css. The
 * board fills everything else: it may run under the action buttons, which
 * hide while a piece walks, and a landed space is shown close up above them.
 */
export function flatInsets(width: number, height: number): SafeInsets {
  // Short landscape phones: the deed and actions sit in a right-hand column.
  if (height <= 500 && width > height) return { top: 54, right: 296, bottom: 8, left: 8 };
  // Tablets and phones: the players run along the top below the turn banner.
  if (width < 1100) return { top: 115, right: 8, bottom: 12, left: 8 };
  // Desktop: players on the left, the deed on the right, the banner on top.
  return { top: 76, right: 324, bottom: 12, left: 284 };
}

export function flatFrame(width: number, height: number): FlatFrame {
  const insets = flatInsets(width, height);
  const freeWidth = Math.max(0, width - insets.left - insets.right);
  const freeHeight = Math.max(0, height - insets.top - insets.bottom);
  const size = Math.max(120, Math.min(freeWidth, freeHeight));
  return {
    unit: size / BOARD_EDGE,
    size,
    left: insets.left + (freeWidth - size) / 2,
    top: insets.top + (freeHeight - size) / 2,
  };
}

/** A board point in pixels from the board square's top-left corner. */
export function toPixels(frame: FlatFrame, x: number, z: number): [number, number] {
  return [(x + BOARD_EDGE / 2) * frame.unit, (z + BOARD_EDGE / 2) * frame.unit];
}

/** A board point on the stage. */
export function toStage(frame: FlatFrame, x: number, z: number): [number, number] {
  const [left, top] = toPixels(frame, x, z);
  return [frame.left + left, frame.top + top];
}

/**
 * Style for a `width` × `depth` patch centred on board point (x, z) and turned
 * like a space on the board (`yaw`, as the 3D board's rotation about its up axis).
 */
export function patchStyle(frame: FlatFrame, x: number, z: number, width: number, depth: number, yaw = 0): CSSProperties {
  const [left, top] = toPixels(frame, x, z);
  return {
    left: left - (width * frame.unit) / 2,
    top: top - (depth * frame.unit) / 2,
    width: width * frame.unit,
    height: depth * frame.unit,
    // Seen from above, a turn of `yaw` about the up axis is a screen rotation of −yaw.
    transform: yaw ? `rotate(${-yaw}rad)` : undefined,
  };
}

/** How large the landed space is shown, as the 3D landing close-up shows it. */
const LANDING_SCALE = 0.42;

/**
 * The landing close-up: a landed space shown upright and large where the 3D
 * camera frames it (the middle of the screen the 3D interface leaves open).
 * Returns its size, its pixels per board unit, and its shown and hidden
 * transforms. It appears in place with a slight grow rather than flying out
 * from its space: without the graphics chip, everything a moving card passes
 * over has to be redrawn (measured: 14% late frames flying, 8% in place).
 */
export function landingCard(frame: FlatFrame, width: number, height: number, index: number) {
  const insets = hudInsets(width, height);
  const freeWidth = Math.max(0, width - insets.left - insets.right);
  const freeHeight = Math.max(0, height - insets.top - insets.bottom);
  const place = tilePlacement(index);
  const depth = place.depth - TILE_GAP;
  const unit = Math.max(frame.unit, (LANDING_SCALE * Math.min(freeWidth, freeHeight)) / depth);
  const centre: [number, number] = [insets.left + freeWidth / 2, insets.top + freeHeight / 2];
  return {
    unit,
    width: (place.width - TILE_GAP) * unit,
    height: depth * unit,
    open: `translate(${centre[0]}px, ${centre[1]}px)`,
    closed: `translate(${centre[0]}px, ${centre[1]}px) scale(0.9)`,
  };
}
