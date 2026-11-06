import { Euler, Quaternion, Vector3 } from 'three';
import { DICE_RECORDINGS, POSITION_SCALE, RECORDED_FPS, type DiceRecording } from './dice.recordings';

export type Vec3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];

export interface PlannedDie {
  value: number;
  /** Turns the die model inside its recorded body so `value` is the face that lands up. */
  modelRotation: QuaternionTuple;
}

export interface ThrowPlan {
  id: number;
  /** Which recorded throw this roll replays. */
  recording: number;
  dice: PlannedDie[];
}

const FACE_NORMALS: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0), 6: new Vector3(0, -1, 0),
  2: new Vector3(1, 0, 0), 5: new Vector3(-1, 0, 0),
  3: new Vector3(0, 0, 1), 4: new Vector3(0, 0, -1),
};

/** Every screen derives the same throw from the server's roll. */
export function throwSeed(rollId: number, values: readonly number[]): number {
  return ((rollId * 1_103_515_245) ^ ((values[0] ?? 0) * 12_345) ^ ((values[1] ?? 0) * 2_654_435_761)) >>> 0;
}

export function buildThrowPlan(rollId: number, seed: number, values: number[]): ThrowPlan {
  const recording = seed % DICE_RECORDINGS.length;
  const { top } = DICE_RECORDINGS[recording];
  return {
    id: rollId,
    recording,
    dice: values.slice(0, 2).map((value, index) => ({
      value,
      modelRotation: quaternionTuple(new Quaternion().setFromUnitVectors(FACE_NORMALS[value], new Vector3(...top[index]))),
    })),
  };
}

export function restingRotation(value: number, yaw: number): QuaternionTuple {
  const base = new Quaternion();
  if (value === 6) base.setFromEuler(new Euler(Math.PI, 0, 0));
  else if (value === 2) base.setFromEuler(new Euler(0, 0, Math.PI / 2));
  else if (value === 5) base.setFromEuler(new Euler(0, 0, -Math.PI / 2));
  else if (value === 3) base.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
  else if (value === 4) base.setFromEuler(new Euler(Math.PI / 2, 0, 0));
  return quaternionTuple(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(base));
}

function quaternionTuple(quaternion: Quaternion): QuaternionTuple {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

const decoded = new Map<number, Int16Array>();
function samples(index: number): Int16Array {
  let data = decoded.get(index);
  if (!data) {
    const text = atob((DICE_RECORDINGS[index] as DiceRecording).data);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    data = new Int16Array(bytes.buffer);
    decoded.set(index, data);
  }
  return data;
}

/** How long a recorded throw lasts, in milliseconds. */
export function throwDurationMs(recording: number): number {
  return ((DICE_RECORDINGS[recording].frames - 1) / RECORDED_FPS) * 1000;
}

const from = new Quaternion();
const to = new Quaternion();
/**
 * Where a die is `elapsedMs` into a recorded throw. Between recorded steps it
 * blends smoothly, so the replay looks the same at any frame rate.
 */
export function throwPose(recording: number, die: number, elapsedMs: number, position: Vector3, rotation: Quaternion): void {
  const data = samples(recording);
  const last = DICE_RECORDINGS[recording].frames - 1;
  const at = Math.min(Math.max(elapsedMs, 0) / 1000 * RECORDED_FPS, last);
  const a = Math.floor(at);
  const b = Math.min(a + 1, last);
  const t = at - a;
  const i = (a * 2 + die) * 7;
  const j = (b * 2 + die) * 7;
  position.set(
    (data[i] + (data[j] - data[i]) * t) / POSITION_SCALE,
    (data[i + 1] + (data[j + 1] - data[i + 1]) * t) / POSITION_SCALE,
    (data[i + 2] + (data[j + 2] - data[i + 2]) * t) / POSITION_SCALE,
  );
  from.set(data[i + 3], data[i + 4], data[i + 5], data[i + 6]).normalize();
  to.set(data[j + 3], data[j + 4], data[j + 5], data[j + 6]).normalize();
  rotation.slerpQuaternions(from, to, t);
}
