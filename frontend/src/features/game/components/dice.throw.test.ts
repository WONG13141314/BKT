import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { DICE_RECORDINGS } from './dice.recordings';
import { buildThrowPlan, throwDurationMs, throwPose } from './dice.throw';

const FACE_NORMALS: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0), 6: new Vector3(0, -1, 0),
  2: new Vector3(1, 0, 0), 5: new Vector3(-1, 0, 0),
  3: new Vector3(0, 0, 1), 4: new Vector3(0, 0, -1),
};

function upward(recording: number, die: number, value: number, modelRotation: [number, number, number, number]) {
  const position = new Vector3();
  const rotation = new Quaternion();
  throwPose(recording, die, Infinity, position, rotation);
  const face = FACE_NORMALS[value].clone().applyQuaternion(new Quaternion(...modelRotation)).applyQuaternion(rotation);
  return { face, position };
}

describe('recorded dice throws', () => {
  it('lands every throw on the rolled faces, for every possible roll', () => {
    for (let recording = 0; recording < DICE_RECORDINGS.length; recording++) {
      for (let first = 1; first <= 6; first++) {
        for (let second = 1; second <= 6; second++) {
          const plan = buildThrowPlan(1, recording, [first, second]);
          expect(plan.recording).toBe(recording);
          plan.dice.forEach((die, index) => {
            const { face, position } = upward(recording, index, die.value, die.modelRotation);
            expect(face.y).toBeGreaterThan(0.999);
            // Resting on the tray floor, inside its walls.
            expect(position.y).toBeCloseTo(0.51, 1);
            expect(Math.abs(position.x)).toBeLessThan(3.7);
            expect(Math.abs(position.z)).toBeLessThan(2.3);
          });
        }
      }
    }
  });

  it('starts in the air and settles within the roll limit', () => {
    for (let recording = 0; recording < DICE_RECORDINGS.length; recording++) {
      const start = new Vector3();
      throwPose(recording, 0, 0, start, new Quaternion());
      expect(start.y).toBeGreaterThan(3);
      expect(throwDurationMs(recording)).toBeGreaterThan(1000);
      expect(throwDurationMs(recording)).toBeLessThan(3000);
    }
  });

  it('blends smoothly between recorded steps', () => {
    const a = new Vector3();
    const b = new Vector3();
    const mid = new Vector3();
    const turn = new Quaternion();
    throwPose(0, 0, 100, a, turn);
    throwPose(0, 0, 100 + 1000 / 60, b, turn);
    throwPose(0, 0, 100 + 500 / 60, mid, turn);
    expect(mid.distanceTo(a.clone().lerp(b, 0.5))).toBeLessThan(1e-3);
    expect(turn.length()).toBeCloseTo(1, 5);
  });
});
