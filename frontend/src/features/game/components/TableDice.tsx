import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CircleGeometry, Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DICE_ROLL_LIMIT_MS } from './board.animation';
import { SceneReady } from './BoardRendering';
import { buildThrowPlan, restingRotation, throwDurationMs, throwPose, throwSeed } from './dice.throw';

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-.22, .22], [.22, -.22]],
  3: [[-.24, .24], [0, 0], [.24, -.24]],
  4: [[-.22, .22], [.22, .22], [-.22, -.22], [.22, -.22]],
  5: [[-.24, .24], [.24, .24], [0, 0], [-.24, -.24], [.24, -.24]],
  6: [[-.23, .25], [.23, .25], [-.23, 0], [.23, 0], [-.23, -.25], [.23, -.25]],
};

const FACES = [
  { value: 1, position: [0, .556, 0], rotation: [-Math.PI / 2, 0, 0] },
  { value: 6, position: [0, -.556, 0], rotation: [Math.PI / 2, 0, 0] },
  { value: 2, position: [.556, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { value: 5, position: [-.556, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { value: 3, position: [0, 0, .556], rotation: [0, 0, 0] },
  { value: 4, position: [0, 0, -.556], rotation: [0, Math.PI, 0] },
] as const;

const DIE_SCALE = 1.02;
const DIE_HALF_EXTENT = .55;
/** The tray floor the throws were recorded on, at full size. */
export const DICE_FLOOR_Y = -.04;
const FLOOR_Y = DICE_FLOOR_Y;

interface Props {
  values: [number, number];
  rollId: number;
  /** The board can finish a roll even while this lazy-loaded scene is loading. */
  animate?: boolean;
  onRollingChange?: (rolling: boolean) => void;
  /** Called once the dice have drawn. */
  onReady?: () => void;
  /** The throws were recorded at full size; the dice are drawn at this size. */
  scale?: number;
}

/**
 * The two dice, replaying a recorded throw. The throw is chosen from the
 * server's roll and played by the clock from the first frame drawn, so every
 * screen shows the same bounces at the same speed, and a slow frame never
 * freezes the dice in the air.
 */
export function TableDice({ values, rollId, animate = true, onRollingChange, onReady, scale = 1 }: Props) {
  const [firstValue, secondValue] = values;
  const activeValues = useMemo(
    () => [firstValue, secondValue].filter((value) => value >= 1 && value <= 6),
    [firstValue, secondValue],
  );
  const plan = useMemo(
    () => buildThrowPlan(rollId, throwSeed(rollId, [firstValue, secondValue]), activeValues),
    [rollId, firstValue, secondValue, activeValues],
  );
  const [completedRollId, setCompletedRollId] = useState(0);
  const completedRollRef = useRef(0);
  const activeRollRef = useRef(rollId);
  const rollingCallback = useRef(onRollingChange);
  activeRollRef.current = rollId;
  rollingCallback.current = onRollingChange;
  const rolling = animate && rollId > 0 && completedRollId !== rollId;
  // When each throw's first frame was drawn. Kept with its roll, so a frame
  // that arrives before React's effects for a new roll never reads the last
  // roll's start (which would end the new throw at once).
  const started = useRef<{ rollId: number; at: number } | null>(null);
  const groups = useRef<(Group | null)[]>([]);
  const invalidate = useThree((state) => state.invalidate);
  const scratch = useMemo(() => ({ position: new Vector3(), rotation: new Quaternion() }), []);

  const finishRoll = useCallback(() => {
    if (activeRollRef.current !== rollId || completedRollRef.current === rollId) return;
    completedRollRef.current = rollId;
    setCompletedRollId(rollId);
    rollingCallback.current?.(false);
  }, [rollId]);

  useEffect(() => {
    if (rollId === 0) return;
    rollingCallback.current?.(true);
    // A background tab draws no frames; the roll still ends on time.
    const timer = setTimeout(finishRoll, DICE_ROLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [rollId, finishRoll]);

  useEffect(() => {
    if (!animate) finishRoll();
  }, [animate, finishRoll]);

  useEffect(() => { invalidate(); }, [plan, rolling, invalidate]);

  // Before the first roll the dice rest side by side; after a roll they stay where it ended.
  const resting = useMemo(() => activeValues.map((value, index) => ({
    position: new Vector3(index === 0 ? -.72 : .72, DIE_HALF_EXTENT + FLOOR_Y + .01, index === 0 ? .08 : -.08),
    model: new Quaternion(...restingRotation(value, index === 0 ? -.35 : .35)),
  })), [activeValues]);
  const thrown = useMemo(() => plan.dice.map((die) => new Quaternion(...die.modelRotation)), [plan]);

  useFrame(() => {
    let elapsed = Infinity;
    if (rolling) {
      const now = performance.now();
      // The throw starts on the first frame actually drawn, so it never skips its opening.
      if (started.current?.rollId !== rollId) started.current = { rollId, at: now };
      elapsed = now - started.current.at;
      if (elapsed >= throwDurationMs(plan.recording)) finishRoll();
      else invalidate();
    }
    plan.dice.forEach((_, index) => {
      const group = groups.current[index];
      if (!group) return;
      if (rollId === 0) {
        scratch.position.copy(resting[index].position);
        scratch.rotation.identity();
      } else {
        throwPose(plan.recording, index, elapsed, scratch.position, scratch.rotation);
      }
      group.position.copy(scratch.position).multiplyScalar(scale);
      group.quaternion.copy(scratch.rotation);
    });
  });

  return (
    <>
      {plan.dice.map((_, index) => (
        <group key={index} ref={(group) => { groups.current[index] = group; }} scale={scale}>
          <DieModel modelQuaternion={rollId === 0 ? resting[index].model : thrown[index]} />
        </group>
      ))}
      <SceneReady onReady={onReady} />
    </>
  );
}

let pipGeometry: BufferGeometry | null = null;
/** All 21 pips of a die as one shape, so each die draws its pips at once. */
function pips(): BufferGeometry {
  if (pipGeometry) return pipGeometry;
  const parts: BufferGeometry[] = [];
  const face = new Matrix4();
  const spot = new Matrix4();
  for (const { value, position, rotation } of FACES) {
    face.compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1));
    for (const [x, y] of PIPS[value]) {
      spot.makeTranslation(x, y, .006);
      parts.push(new CircleGeometry(.071, 24).applyMatrix4(spot.clone().premultiply(face)));
    }
  }
  pipGeometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return pipGeometry;
}

function DieModel({ modelQuaternion }: { modelQuaternion: Quaternion }) {
  return (
    <group scale={DIE_SCALE} quaternion={modelQuaternion}>
      <RoundedBox castShadow receiveShadow args={[1.08, 1.08, 1.08]} radius={.14} smoothness={6}>
        <meshPhysicalMaterial color="#fffdf5" roughness={.24} clearcoat={.18} clearcoatRoughness={.3} />
      </RoundedBox>
      <mesh geometry={pips()}>
        <meshStandardMaterial color="#090a09" roughness={.38} />
      </mesh>
    </group>
  );
}
