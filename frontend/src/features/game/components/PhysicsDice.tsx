import { RoundedBox } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Euler, Group, MathUtils, Quaternion, Vector3 } from 'three';

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

// Keep the dice compact enough to tumble without filling the board centre.
// The resting height follows the actual scaled cube, so the dice still touch
// the floor instead of floating after their visual size is reduced.
const DIE_SCALE = 1.02;
const DIE_REST_Y = .56;
const ROLL_DURATION = 2.35;

function rollNoise(seed: number, index: number, salt: number) {
  const value = Math.sin((seed + 1) * 91.733 + (index + 1) * 47.231 + salt * 19.117) * 43758.5453;
  return value - Math.floor(value);
}

interface Props {
  values: [number, number];
  rollId: number;
  onRollingChange?: (rolling: boolean) => void;
}

export function PhysicsDice({ values, rollId, onRollingChange }: Props) {
  const settled = useRef(new Set<number>());

  useEffect(() => {
    settled.current.clear();
    if (rollId > 0) onRollingChange?.(true);
  }, [rollId, onRollingChange]);

  const markSettled = (index: number) => {
    settled.current.add(index);
    if (settled.current.size === 2) onRollingChange?.(false);
  };

  return (
    <div className="physics-dice" aria-label={`Dice showing ${values[0]} and ${values[1]}`}>
      <Canvas
        shadows
        dpr={[1, 2]}
        style={{ pointerEvents: 'none' }}
        camera={{ position: [0, 6.2, 7.7], fov: 29, near: .1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(0, .6, 0)}
      >
        <ambientLight intensity={1.12} />
        <directionalLight castShadow position={[-4, 8, 5]} intensity={2.45} />
        <pointLight position={[4, 4, 4]} intensity={18} distance={12} color="#fff3d3" />
        <mesh receiveShadow position={[0, -.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7, 4]} />
          <shadowMaterial transparent opacity={.09} />
        </mesh>
        {values.map((value, index) => (
          <AnimatedDie
            key={`${rollId}-${index}`}
            index={index}
            value={value}
            rollId={rollId}
            onSettled={markSettled}
          />
        ))}
      </Canvas>
    </div>
  );
}

function targetRotation(value: number, yaw: number) {
  const base = new Quaternion();
  if (value === 6) base.setFromEuler(new Euler(Math.PI, 0, 0));
  else if (value === 2) base.setFromEuler(new Euler(0, 0, Math.PI / 2));
  else if (value === 5) base.setFromEuler(new Euler(0, 0, -Math.PI / 2));
  else if (value === 3) base.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
  else if (value === 4) base.setFromEuler(new Euler(Math.PI / 2, 0, 0));
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(base);
}

function AnimatedDie({
  index,
  value,
  rollId,
  onSettled,
}: {
  index: number;
  value: number;
  rollId: number;
  onSettled: (index: number) => void;
}) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  const reported = useRef(false);
  const direction = index === 0 ? -1 : 1;
  // This seed affects visuals only; the server-provided dice values remain
  // authoritative. Fresh entropy prevents the first roll of every room from
  // replaying an identical throw path.
  const visualSeed = useMemo(() => rollId * 97 + value * 31 + index * 53 + Math.random() * 10_000, [index, rollId, value]);
  const motion = useMemo(() => ({
    startX: direction * (1.82 + rollNoise(visualSeed, index, 1) * .42),
    startY: 3.65 + rollNoise(visualSeed, index, 2) * .65,
    startZ: -direction * (.52 + rollNoise(visualSeed, index, 3) * .48),
    endX: direction * (.62 + rollNoise(visualSeed, index, 4) * .22),
    endZ: (rollNoise(visualSeed, index, 5) - .5) * .48,
    curveX: (rollNoise(visualSeed, index, 6) - .5) * 2.2,
    curveZ: direction * (.62 + rollNoise(visualSeed, index, 7) * .86),
    wobblePhase: rollNoise(visualSeed, index, 8) * Math.PI * 2,
  }), [direction, index, visualSeed]);
  const yaw = rollNoise(visualSeed, index, 12) * Math.PI * 2;
  const finalQuaternion = useMemo(() => targetRotation(value, yaw), [value, yaw]);
  const spinEnd = useMemo(() => new Quaternion().setFromEuler(new Euler(
    6.8 + rollNoise(visualSeed, index, 13) * 2.4,
    7.4 + rollNoise(visualSeed, index, 14) * 2.8,
    6.3 + rollNoise(visualSeed, index, 15) * 2.5,
  )), [index, visualSeed]);

  useEffect(() => {
    elapsed.current = rollId > 0 ? 0 : 2.2;
    reported.current = false;
  }, [rollId]);

  useFrame((_, delta) => {
    if (!group.current) return;

    if (rollId === 0) {
      group.current.position.set(motion.endX, DIE_REST_Y, motion.endZ);
      group.current.quaternion.copy(finalQuaternion);
      return;
    }

    elapsed.current = Math.min(ROLL_DURATION, elapsed.current + delta);
    const t = elapsed.current / ROLL_DURATION;

    // Keep horizontal momentum through the bounces. The old cubic ease had
    // already completed almost all travel before impact, which made each die
    // appear to spin in one fixed spot after dropping.
    const travel = MathUtils.smootherstep(t, 0, 1);
    const airborne = Math.sin(travel * Math.PI);
    const fadingWobble = Math.sin(travel * Math.PI * 3 + motion.wobblePhase) * (1 - travel);
    const x = MathUtils.lerp(motion.startX, motion.endX, travel)
      + airborne * motion.curveX
      + fadingWobble * .13;
    const z = MathUtils.lerp(motion.startZ, motion.endZ, travel)
      + airborne * motion.curveZ
      + fadingWobble * .18;
    const impactAt = .5;
    const fall = Math.min(1, t / impactAt);
    let y = MathUtils.lerp(motion.startY, DIE_REST_Y, fall * fall);

    if (t > impactAt) {
      const bounceT = (t - impactAt) / (1 - impactAt);
      y = DIE_REST_Y
        + Math.abs(Math.sin(bounceT * Math.PI * 3.35)) * (1 - bounceT) ** 1.35 * 1.05;
    }

    group.current.position.set(x, y, z);

    if (t < .7) {
      const spin = new Quaternion().setFromEuler(new Euler(
        (6.8 + rollNoise(visualSeed, index, 9) * 2.4) * (t / .7) + index,
        (7.4 + rollNoise(visualSeed, index, 10) * 2.8) * (t / .7),
        (6.3 + rollNoise(visualSeed, index, 11) * 2.5) * (t / .7) + index * 1.4,
      ));
      group.current.quaternion.copy(spin);
    } else {
      const settle = MathUtils.smoothstep((t - .7) / .3, 0, 1);
      group.current.quaternion.copy(spinEnd).slerp(finalQuaternion, settle);
    }

    if (t >= 1) {
      group.current.position.set(motion.endX, DIE_REST_Y, motion.endZ);
      group.current.quaternion.copy(finalQuaternion);
      if (!reported.current) {
        reported.current = true;
        onSettled(index);
      }
    }
  });

  return (
    <group ref={group} scale={DIE_SCALE}>
      <RoundedBox castShadow receiveShadow args={[1.08, 1.08, 1.08]} radius={.14} smoothness={6}>
        <meshPhysicalMaterial color="#fffdf5" roughness={.24} clearcoat={.18} clearcoatRoughness={.3} />
      </RoundedBox>
      {FACES.map((face) => <PipFace key={face.value} {...face} />)}
    </group>
  );
}

function PipFace({ value, position, rotation }: (typeof FACES)[number]) {
  return (
    <group position={position} rotation={rotation}>
      {PIPS[value].map(([x, y], index) => (
        <mesh key={index} position={[x, y, .006]}>
          <circleGeometry args={[.071, 24]} />
          <meshStandardMaterial color="#090a09" roughness={.38} />
        </mesh>
      ))}
    </group>
  );
}
