// World layout of the 3D board, in the proportions of a printed Monopoly board:
// narrow spaces around a large open centre. Mula (0) is the near-right corner
// and play runs clockwise seen from above, as on the 2D board.
//
//   x → right, z → towards the viewer of the opening view, y → up.

export const TILE_COUNT = 20;
/** Width of a side space along the route. */
export const SIDE_WIDTH = 2;
/** Depth of every space from the board edge inwards; corners are this square. */
export const TILE_DEPTH = 2.2;
export const BOARD_HALF = TILE_DEPTH + 2 * SIDE_WIDTH; // 6.2
/** The printed rule lines between spaces. */
export const TILE_GAP = 0.05;
/** The board's printed surface; pieces stand on it. */
export const SURFACE_Y = 0;
/** Depth of the colour band on a property's inner edge. */
export const BAND_DEPTH = 0.52;
export const CENTRE_SIZE = (BOARD_HALF - TILE_DEPTH) * 2;

const CORNER_CENTRE = BOARD_HALF - TILE_DEPTH / 2;

export interface TilePlacement {
  index: number;
  /** 0 bottom, 1 left, 2 top, 3 right. A corner reports the side it starts. */
  side: number;
  corner: boolean;
  x: number;
  z: number;
  /** Footprint along the route and towards the outside. */
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
 * Where piece `slot` of `count` stands on a space, in world units. Pieces keep
 * clear of the colour band and spread out so all four stay visible.
 */
export function tokenSpot(rawIndex: number, slot: number, count: number): [number, number] {
  const tile = tilePlacement(rawIndex);
  const scale = tile.corner ? 1.15 : 1;
  const spots: [number, number][] = count <= 1 ? [[0, 0.25]]
    : count === 2 ? [[-0.45, 0.25], [0.45, 0.25]]
      : [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.65], [0.45, 0.65]];
  const [across, out] = spots[Math.min(slot, spots.length - 1)];
  const [x, z] = rotateOffset(across * scale, out * scale, tile.yaw);
  return [tile.x + x, tile.z + z];
}

/** Forward spaces from one index to another, 0–19. */
export function forwardSteps(from: number, to: number): number {
  return (wrapTile(to) - wrapTile(from) + TILE_COUNT) % TILE_COUNT;
}

/** The next `count` spaces after `from`, stopping at `to`. */
export function spacesAhead(from: number, to: number, count: number): number[] {
  const steps = Math.min(count, forwardSteps(from, to));
  return Array.from({ length: steps }, (_, i) => wrapTile(from + i + 1));
}

// ---- The route field ----
//
// Directions on the table come from one smooth field rather than per-side
// rules: the level sets of a superellipse |x|^n + |z|^n, which are rounded
// squares hugging the route. Its gradient points outwards (where the camera
// stands); its tangent is the direction of travel. Both turn gradually as a
// piece approaches a corner and are exactly square to a side in between.

const FIELD_POWER = 7;

/** Outward direction at a point on the table, as an azimuth: 0 faces +z, π/2 faces +x. */
export function outwardAzimuth(x: number, z: number): number {
  const scale = Math.max(Math.abs(x), Math.abs(z), 1e-6);
  const gx = Math.sign(x) * Math.abs(x / scale) ** (FIELD_POWER - 1);
  const gz = Math.sign(z) * Math.abs(z / scale) ** (FIELD_POWER - 1);
  return Math.atan2(gx, gz);
}

/**
 * A piece's facing on a space (models are built facing +x): along its side of
 * the route, a corner counting as the start of the next side, turned a little
 * outwards to show its profile. It is fixed per side, so pieces never turn
 * except a quarter turn at a corner.
 */
export const OUTWARD_TURN = 0.25;
export function pieceFacing(index: number): number {
  return Math.PI - Math.floor(wrapTile(index) / 5) * Math.PI / 2 + OUTWARD_TURN;
}

/** The outward azimuth of a whole side, for views square to it. */
export function sideAzimuth(side: number): number {
  return -side * Math.PI / 2;
}

/** `angle` shifted by whole turns to lie nearest `reference`. */
export function nearestAngle(angle: number, reference: number): number {
  const turn = Math.PI * 2;
  return angle + Math.round((reference - angle) / turn) * turn;
}
