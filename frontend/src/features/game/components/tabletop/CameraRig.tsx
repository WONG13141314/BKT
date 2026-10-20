import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { nearestSide, sideProgress } from './board.layout';
import {
  cameraPosition, cornerness, followGoal, overviewGoal,
  type CameraGoal, type CameraMode, type CameraViewport, type SafeInsets,
} from './camera';

/** Where each piece is this frame, written by the pieces and read by the camera. */
export interface TokenMotion { x: number; z: number; track: number; moving: boolean }

interface Props {
  mode: CameraMode;
  focusId: string | undefined;
  /** The active piece's space, for the overview's facing before it has moved. */
  restingTrack: number;
  insets: SafeInsets;
  reducedMotion: boolean;
  motion: Map<string, TokenMotion>;
}

// How quickly each framing is approached (per second). Following is tight so
// the piece stays put on screen; handovers and the overview ease more gently.
const RATES: Record<CameraMode, number> = { follow: 5.5, landing: 4, dice: 2.4, overview: 2.2 };

/**
 * The automatic camera. It never takes input: it eases an orbit (target, side,
 * distance, pitch) towards the framing for the current moment, and stops
 * requesting frames once settled.
 */
export function CameraRig({ mode, focusId, restingTrack, insets, reducedMotion, motion }: Props) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const current = useRef<CameraGoal | null>(null);
  const target = useRef(new Vector3());
  const position = useRef(new Vector3());
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

  useEffect(() => { invalidate(); }, [mode, focusId, restingTrack, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    const focus = focusId ? motion.get(focusId) : undefined;
    const now = current.current;
    const sideNow = now?.side ?? Math.floor(restingTrack / 5);
    let goal: CameraGoal;
    if ((mode === 'follow' || mode === 'landing') && focus) {
      const side = nearestSide(sideProgress(focus.track), sideNow);
      goal = followGoal(focus, side, cornerness(focus.track), viewport.current, mode);
    } else {
      // Square to the side the piece is on, or about to walk along from a corner.
      const track = focus?.track ?? restingTrack;
      const side = nearestSide(Math.floor(track / 5 + 1e-6), sideNow);
      goal = overviewGoal(side, viewport.current, mode === 'dice' ? 'dice' : 'overview');
    }

    if (!now || (reducedMotion && mode === 'overview')) {
      current.current = { ...goal, target: [...goal.target] };
    } else {
      // Long frames (a background tab) clamp, so the camera never overshoots.
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * RATES[mode] * (reducedMotion ? 2 : 1));
      now.target = now.target.map((value, i) => MathUtils.lerp(value, goal.target[i], k)) as CameraGoal['target'];
      now.side = MathUtils.lerp(now.side, goal.side, k);
      now.distance = MathUtils.lerp(now.distance, goal.distance, k);
      now.pitch = MathUtils.lerp(now.pitch, goal.pitch, k);
    }

    const settled = current.current!;
    cameraPosition(settled, position.current);
    target.current.set(...settled.target);
    camera.position.copy(position.current);
    camera.lookAt(target.current);

    const remaining = Math.abs(settled.side - goal.side) * 4
      + Math.abs(settled.distance - goal.distance) / 4
      + Math.abs(settled.pitch - goal.pitch)
      + Math.hypot(settled.target[0] - goal.target[0], settled.target[2] - goal.target[2]) / 2;
    if (remaining > 0.002 || focus?.moving) invalidate();
  });

  return null;
}
