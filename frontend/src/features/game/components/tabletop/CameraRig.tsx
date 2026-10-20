import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { nearestAngle, sideAzimuth, spacesAhead } from './board.layout';
import {
  overviewShot, shotPosition, springStep, travelShot,
  type CameraMode, type CameraShot, type CameraViewport, type SafeInsets,
} from './camera';

/** Where each piece is this frame, written by the pieces and read by the camera. */
export interface TokenMotion {
  /** The piece itself, including its place beside other pieces. */
  x: number;
  z: number;
  /** The route centre under the piece, which the camera tracks. */
  cx: number;
  cz: number;
  /** The space the piece is on, or hopping to. */
  index: number;
  moving: boolean;
}

interface Props {
  mode: CameraMode;
  focusId: string | undefined;
  /** The active piece's space, before it has drawn a frame. */
  restingIndex: number;
  /** Where the active piece's current move ends. */
  destination: number | null;
  insets: SafeInsets;
  reducedMotion: boolean;
  motion: Map<string, TokenMotion>;
}

// Spring stiffness per moment (higher settles faster). Travel is tight so the
// piece stays put on screen; handovers to the overview are slow and calm.
const STIFFNESS: Record<CameraMode, number> = { follow: 7.5, landing: 6.5, dice: 3.2, overview: 2.7 };
const AHEAD = 3;

function toArray(shot: CameraShot): number[] {
  return [...shot.target, shot.azimuth, shot.elevation, shot.distance];
}

function fromArray(values: readonly number[]): CameraShot {
  return { target: [values[0], values[1], values[2]], azimuth: values[3], elevation: values[4], distance: values[5] };
}

/**
 * The automatic camera. It takes no input: each frame it works out the shot
 * for the current moment and eases towards it with critically damped springs,
 * then stops requesting frames once everything has settled.
 */
export function CameraRig({ mode, focusId, restingIndex, destination, insets, reducedMotion, motion }: Props) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const values = useRef<number[] | null>(null);
  const velocities = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const position = useRef(new Vector3());
  const look = useRef(new Vector3());
  const viewport = useRef<CameraViewport>({ width: size.width, height: size.height, fov: camera.fov, insets });
  viewport.current = { width: size.width, height: size.height, fov: camera.fov, insets };

  // Centre the projection on the part of the screen the interface leaves open.
  useLayoutEffect(() => {
    const dx = (insets.left - insets.right) / 2;
    const dy = (insets.top - insets.bottom) / 2;
    camera.setViewOffset(size.width, size.height, -dx, -dy, size.width, size.height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, insets.bottom, insets.left, insets.right, insets.top, invalidate, size.height, size.width]);

  useEffect(() => { invalidate(); }, [mode, focusId, restingIndex, destination, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    const focus = focusId ? motion.get(focusId) : undefined;
    const index = focus?.index ?? restingIndex;
    const current = values.current;

    let shot: CameraShot;
    if ((mode === 'follow' || mode === 'landing') && focus) {
      // Spaces still to walk (up to three); none once the final hop has begun.
      const ahead = mode === 'follow' && destination !== null ? spacesAhead(index, destination, AHEAD) : [];
      shot = travelShot({ x: focus.cx, z: focus.cz }, ahead, destination, viewport.current, mode);
    } else {
      // Square to the side the piece is on, or about to walk along from a corner.
      shot = overviewShot(sideAzimuth(Math.floor(index / 5)), viewport.current, mode === 'dice' ? 'dice' : 'overview');
    }
    if (current) shot.azimuth = nearestAngle(shot.azimuth, current[3]);
    const goal = toArray(shot);

    let moving = false;
    if (!current || reducedMotion) {
      // Reduced motion cuts between framings instead of travelling.
      values.current = goal;
      velocities.current = [0, 0, 0, 0, 0, 0];
    } else {
      // A long frame (a background tab) is clamped, so the camera never leaps.
      const dt = Math.min(delta, 0.1);
      const stiffness = STIFFNESS[mode];
      for (let i = 0; i < goal.length; i++) {
        const [value, velocity] = springStep(current[i], velocities.current[i], goal[i], stiffness, dt);
        current[i] = value;
        velocities.current[i] = velocity;
        const scale = i === 3 || i === 4 ? 4 : i === 5 ? 0.25 : 1;
        if (Math.abs(value - goal[i]) * scale > 0.002 || Math.abs(velocity) * scale > 0.002) moving = true;
      }
    }

    const settled = fromArray(values.current!);
    shotPosition(settled, position.current);
    look.current.set(...settled.target);
    camera.position.copy(position.current);
    camera.lookAt(look.current);
    if (moving || focus?.moving) invalidate();
  });

  return null;
}
