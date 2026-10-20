// World layout of the 3D board. Classic proportions: square corners whose side
// equals the depth of the narrow side spaces. Mula (0) is the near-right corner
// and play runs clockwise when seen from above, as on the 2D board.
//
//   x → right, z → towards the viewer of the opening view, y → up.

export const TILE_COUNT = 20;
export const SIDE_WIDTH = 2;
export const TILE_DEPTH = 3;
export const BOARD_HALF = TILE_DEPTH + 2 * SIDE_WIDTH; // 7: corner centre at ±5.5
export const TILE_GAP = 0.07;
export const BOARD_TOP = 0;
export const TILE_TOP = 0.16;
/** Depth of the colour band on a property's inner edge. */
export const BAND_DEPTH = 0.72;

const CORNER_CENTRE = BOARD_HALF - TILE_DEPTH / 2;

export interface TilePlacement {
  index: number;
  /** 0 bottom, 1 left, 2 top, 3 right. A corner reports the side it starts. */
  side: number;
  corner: boolean;
  x: number;
  z: number;
  /** Footprint along the track and towards the outside. */
  width: number;
  depth: number;
  /** Rotation about Y that turns the bottom-side frame into this side's frame. */
  yaw: number;
}

export function wrapTile(index: number): number {
  const tile = Math.floor(Number.isFinite(index) ? index : 0);
  return ((tile % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;
}

export function sideYaw(side: number): number {
  return -side * Math.PI / 2;
}

export function tilePlacement(rawIndex: number): TilePlacement {
  const index = wrapTile(rawIndex);
  const side = Math.floor(index / 5);
  const step = index % 5;
  const corner = step === 0;
  // Distance along the side from its starting corner's centre.
  const along = corner ? 0 : CORNER_CENTRE - (TILE_DEPTH / 2 + SIDE_WIDTH * (step - 0.5));
  const [x, z] = side === 0 ? [corner ? CORNER_CENTRE : along, CORNER_CENTRE]
    : side === 1 ? [-CORNER_CENTRE, corner ? CORNER_CENTRE : along]
      : side === 2 ? [corner ? -CORNER_CENTRE : -along, -CORNER_CENTRE]
        : [CORNER_CENTRE, corner ? -CORNER_CENTRE : -along];
  return {
    index, side, corner, x, z,
    width: corner ? TILE_DEPTH : SIDE_WIDTH,
    depth: TILE_DEPTH,
    yaw: sideYaw(side),
  };
}

/** Rotate a bottom-frame offset (x along the board, z outwards) into world space. */
export function rotateOffset(x: number, z: number, yaw: number): [number, number] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, -x * sin + z * cos];
}

/**
 * Continuous side number for a track position that may run past 20. Mid-side
 * positions are whole numbers; each corner blends a quarter turn across
 * `window` spaces either side, so headings never jump.
 */
export function sideProgress(track: number, window = 0.85): number {
  const value = Number.isFinite(track) ? track : 0;
  const corner = Math.round(value / 5) * 5;
  const offset = value - corner;
  const t = Math.min(1, Math.max(0, (offset + window) / (window * 2)));
  return corner / 5 - 1 + t * t * (3 - 2 * t);
}

/** Pick the representation of `target` (mod 4 sides) nearest `current`. */
export function nearestSide(target: number, current: number): number {
  return target + Math.round((current - target) / 4) * 4;
}

/**
 * Where piece `slot` of `count` stands on a space, in world units. Pieces keep
 * clear of the colour band and spread out so all four stay visible.
 */
export function tokenSpot(rawIndex: number, slot: number, count: number): [number, number] {
  const tile = tilePlacement(rawIndex);
  const scale = tile.corner ? 1.25 : 1;
  const spots: [number, number][] = count <= 1 ? [[0, 0.3]]
    : count === 2 ? [[-0.48, 0.3], [0.48, 0.3]]
      : [[-0.48, -0.2], [0.48, -0.2], [-0.48, 0.82], [0.48, 0.82]];
  const [across, out] = spots[Math.min(slot, spots.length - 1)];
  const [x, z] = rotateOffset(across * scale, out * scale, tile.yaw);
  return [tile.x + x, tile.z + z];
}

/** Facing for a piece travelling along the track (models point along +x). */
export function travelYaw(side: number): number {
  return Math.PI - side * Math.PI / 2;
}

/** Forward spaces from one index to another, 0–19. */
export function forwardSteps(from: number, to: number): number {
  return (wrapTile(to) - wrapTile(from) + TILE_COUNT) % TILE_COUNT;
}
