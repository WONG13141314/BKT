import { Vector3 } from 'three';
import { BOARD_HALF, rotateOffset, sideYaw } from './board.layout';

export type CameraMode = 'overview' | 'dice' | 'follow' | 'landing';

/** Screen insets, in CSS pixels, that the interface covers. */
export interface SafeInsets { top: number; right: number; bottom: number; left: number }

export interface CameraViewport {
  width: number;
  height: number;
  fov: number;
  insets: SafeInsets;
}

/** An orbit around a ground target. Interpolating these keeps the camera above the board. */
export interface CameraGoal {
  target: [number, number, number];
  /** Continuous side (see `sideProgress`): the camera sits outside this side. */
  side: number;
  distance: number;
  /** Elevation above the table, in radians. */
  pitch: number;
}

const WORLD_UP = new Vector3(0, 1, 0);
const OVERVIEW_PITCH = 0.98;
const DICE_PITCH = 1.05;
const FOLLOW_PITCH = 0.6;
const LANDING_PITCH = 0.7;

function safeSize(viewport: CameraViewport) {
  const { width, height, insets } = viewport;
  const safeWidth = Math.max(160, width - insets.left - insets.right);
  const safeHeight = Math.max(160, height - insets.top - insets.bottom);
  const tanHalf = Math.tan((viewport.fov * Math.PI) / 360);
  return { tanH: tanHalf * (safeWidth / height), tanV: tanHalf * (safeHeight / height) };
}

/** Unit vector from the target towards the camera. */
export function orbitDirection(side: number, pitch: number): Vector3 {
  const [x, z] = rotateOffset(0, Math.cos(pitch), sideYaw(side));
  return new Vector3(x, Math.sin(pitch), z).normalize();
}

export function cameraPosition(goal: CameraGoal, out = new Vector3()): Vector3 {
  return out.copy(orbitDirection(goal.side, goal.pitch)).multiplyScalar(goal.distance).add(new Vector3(...goal.target));
}

/** The shortest distance at which every point fits inside the uncovered part of the screen. */
export function fitDistance(points: readonly Vector3[], target: Vector3, back: Vector3, viewport: CameraViewport, margin = 1.04): number {
  const { tanH, tanV } = safeSize(viewport);
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

const BOARD_EXTENT = BOARD_HALF + 0.25;
const BOARD_POINTS = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 0.9].map((y) =>
  new Vector3(x * BOARD_EXTENT, y, z * BOARD_EXTENT))));

export function overviewGoal(side: number, viewport: CameraViewport, mode: 'overview' | 'dice' = 'overview'): CameraGoal {
  const pitch = mode === 'dice' ? DICE_PITCH : OVERVIEW_PITCH;
  const target = new Vector3(0, 0, 0);
  const distance = fitDistance(BOARD_POINTS, target, orbitDirection(side, pitch), viewport);
  return { target: [0, 0, 0], side, pitch, distance: mode === 'dice' ? distance * 0.94 : distance };
}

/**
 * Close third-person framing behind the travelling piece: about three to four
 * spaces across, the route ahead visible, widening a little around corners.
 */
export function followGoal(
  anchor: Readonly<{ x: number; z: number }>,
  side: number,
  cornerness: number,
  viewport: CameraViewport,
  mode: 'follow' | 'landing',
): CameraGoal {
  const landing = mode === 'landing';
  const { tanH, tanV } = safeSize(viewport);
  // Portrait screens show fewer spaces across so the piece stays a readable size.
  const portrait = viewport.width < viewport.height;
  const span = (landing ? (portrait ? 4.2 : 5.4) : (portrait ? 5.6 : 7.6)) * (1 + 0.28 * cornerness);
  const depthSpan = landing ? 3.6 : 4.4;
  const distance = Math.max(span / 2 / tanH, depthSpan / 2 / tanV);
  // Look slightly ahead along the route and in towards the board centre.
  const [ox, oz] = rotateOffset(landing ? 0 : -1.1 * (1 - cornerness * 0.5), landing ? -0.45 : -0.75, sideYaw(side));
  return {
    target: [anchor.x + ox, 0.2, anchor.z + oz],
    side,
    pitch: landing ? LANDING_PITCH : FOLLOW_PITCH,
    distance,
  };
}

/** 1 on a corner space, falling to 0 a little over a space away. */
export function cornerness(track: number): number {
  const fromCorner = Math.abs(track - Math.round(track / 5) * 5);
  return Math.max(0, 1 - fromCorner / 1.4);
}
