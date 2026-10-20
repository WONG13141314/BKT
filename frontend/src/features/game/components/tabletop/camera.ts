import { Vector3 } from 'three';
import { BOARD_HALF, outwardAzimuth, tilePlacement } from './board.layout';

export type CameraMode = 'overview' | 'dice' | 'follow' | 'landing';

/** Screen insets, in CSS pixels, that the interface covers. */
export interface SafeInsets { top: number; right: number; bottom: number; left: number }

export interface CameraViewport {
  width: number;
  height: number;
  fov: number;
  insets: SafeInsets;
}

/**
 * A camera shot as an orbit around a point on the table. Moving between shots
 * means easing these numbers, so the camera always stays outside and above the
 * board instead of cutting through it.
 */
export interface CameraShot {
  target: [number, number, number];
  /** Where the camera stands around the target: 0 is +z (the near side), π/2 is +x. */
  azimuth: number;
  /** Height angle above the table, in radians. */
  elevation: number;
  distance: number;
}

const WORLD_UP = new Vector3(0, 1, 0);

// Elevations chosen for each moment: low and close while travelling, looking
// down onto the landed space, and high enough to read the whole board.
const ELEVATION = { overview: 0.98, dice: 0.95, follow: 0.66, landing: 0.82 };
// The camera trails a little behind the moving piece, so the route ahead
// recedes diagonally into the picture (a three-quarter tracking shot).
const TRAIL = { follow: 0.34, landing: 0.12 };

export function shotDirection(azimuth: number, elevation: number, out = new Vector3()): Vector3 {
  return out.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
}

export function shotPosition(shot: CameraShot, out = new Vector3()): Vector3 {
  return shotDirection(shot.azimuth, shot.elevation, out).multiplyScalar(shot.distance)
    .add(new Vector3(...shot.target));
}

function safeTangents(viewport: CameraViewport) {
  const { width, height, insets } = viewport;
  const safeWidth = Math.max(160, width - insets.left - insets.right);
  const safeHeight = Math.max(160, height - insets.top - insets.bottom);
  const tanHalf = Math.tan((viewport.fov * Math.PI) / 360);
  return { tanH: tanHalf * (safeWidth / height), tanV: tanHalf * (safeHeight / height) };
}

/** The shortest distance at which every point fits inside the uncovered part of the screen. */
export function fitDistance(points: readonly Vector3[], target: Vector3, back: Vector3, viewport: CameraViewport, margin = 1.04): number {
  const { tanH, tanV } = safeTangents(viewport);
  const right = new Vector3().crossVectors(WORLD_UP, back).normalize();
  const up = new Vector3().crossVectors(back, right).normalize();
  const offset = new Vector3();
  let distance = 0;
  for (const point of points) {
    offset.copy(point).sub(target);
    const depth = offset.dot(back);
    distance = Math.max(
      distance,
      depth + Math.abs(offset.dot(right) * margin) / tanH,
      depth + Math.abs(offset.dot(up) * margin) / tanV,
    );
  }
  return distance;
}

const BOARD_EXTENT = BOARD_HALF + 0.2;
const BOARD_POINTS = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 0.9].map((y) =>
  new Vector3(x * BOARD_EXTENT, y, z * BOARD_EXTENT))));

// The tray in the centre where the dice land, with a little room around it.
const TRAY_POINTS = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 0.6].map((y) =>
  new Vector3(x * 2.8, y, z * 2.2))));

/**
 * The whole board viewed square to one side, or, while the dice roll, a closer
 * look at the tray: the dice are the subject of that moment.
 */
export function overviewShot(azimuth: number, viewport: CameraViewport, mode: 'overview' | 'dice' = 'overview'): CameraShot {
  const elevation = ELEVATION[mode];
  const target = new Vector3(0, 0, 0);
  const points = mode === 'dice' ? TRAY_POINTS : BOARD_POINTS;
  const distance = fitDistance(points, target, shotDirection(azimuth, elevation), viewport, mode === 'dice' ? 1.15 : 1.04);
  return { target: [0, 0, 0], azimuth, elevation, distance };
}

function tileCorners(index: number, y = 0): Vector3[] {
  const tile = tilePlacement(index);
  const half = Math.max(tile.width, tile.depth) / 2;
  return [-1, 1].flatMap((x) => [-1, 1].map((z) => new Vector3(tile.x + x * half, y, tile.z + z * half)));
}

/**
 * Framing that knows where the move ends. While travelling it keeps the piece
 * and the next spaces in view, with room ahead of the piece; as the piece nears
 * its destination the destination joins the frame, so arriving needs no new
 * camera move. Landing frames the piece on its space, looking down onto it.
 */
export function travelShot(
  anchor: Readonly<{ x: number; z: number }>,
  ahead: readonly number[],
  destination: number | null,
  viewport: CameraViewport,
  mode: 'follow' | 'landing',
): CameraShot {
  const landing = mode === 'landing';
  // Over the last two spaces the travelling shot becomes the landing shot,
  // so the arrival is already framed when the piece touches down.
  const approach = landing ? 0 : Math.min(1, ahead.length / 2);
  const mix = (arrive: number, travel: number) => arrive + (travel - arrive) * approach;
  const azimuth = outwardAzimuth(anchor.x, anchor.z) + mix(TRAIL.landing, TRAIL.follow);
  const elevation = mix(ELEVATION.landing, ELEVATION.follow);
  const back = shotDirection(azimuth, elevation);
  const piece = new Vector3(anchor.x, 0.4, anchor.z);
  const points = [piece, new Vector3(anchor.x, 0, anchor.z)];
  const aheadCentres = ahead.map((index) => {
    const tile = tilePlacement(index);
    return new Vector3(tile.x, 0, tile.z);
  });
  points.push(...aheadCentres);
  if (destination !== null && (approach === 0 || ahead.includes(destination))) points.push(...tileCorners(destination));

  // Weight the aim towards the piece; the route ahead pulls it forward.
  const target = piece.clone().setY(0);
  if (aheadCentres.length) {
    const lead = aheadCentres.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(aheadCentres.length);
    target.lerp(lead, 0.4);
  }
  // Aim slightly inwards, which sits the piece in the lower part of the frame.
  const inward = new Vector3(-back.x, 0, -back.z).normalize().multiplyScalar(mix(0.35, 0.6));
  target.add(inward);

  const fitted = fitDistance(points, target, back, viewport, mix(1.45, 1.12));
  const [near, far] = [mix(5.5, 6.5), mix(11, 13)];
  return {
    target: [target.x, 0.15, target.z],
    azimuth,
    elevation,
    distance: Math.min(far, Math.max(near, fitted)),
  };
}

/**
 * One step of a critically damped spring: the fastest approach to `goal`
 * without overshoot, keeping velocity across changes of goal so the camera
 * never jerks when the moment changes.
 */
export function springStep(value: number, velocity: number, goal: number, stiffness: number, dt: number): [number, number] {
  const decay = Math.exp(-stiffness * dt);
  const offset = value - goal;
  const carry = (velocity + stiffness * offset) * dt;
  return [goal + (offset + carry) * decay, (velocity - stiffness * carry) * decay];
}
