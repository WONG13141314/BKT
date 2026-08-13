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
  const startX = index === 0 ? -1.9 : 1.9;
  const endX = index === 0 ? -.92 : .92;
  const endZ = index === 0 ? .08 : -.08;
  const yaw = ((rollId * 37 + index * 71) % 100) / 100 * Math.PI * 2;
  const finalQuaternion = useMemo(() => targetRotation(value, yaw), [value, yaw]);
  const spinEnd = useMemo(() => new Quaternion().setFromEuler(new Euler(
    7.1 + rollId * .17 + index,
    8.4 + rollId * .13,
    6.6 + index * 1.4,
  )), [index, rollId]);

  useEffect(() => {
    elapsed.current = rollId > 0 ? 0 : 2.2;
    reported.current = false;
  }, [rollId]);

  useFrame((_, delta) => {
    if (!group.current) return;

    if (rollId === 0) {
      group.current.position.set(endX, .73, endZ);
      group.current.quaternion.copy(finalQuaternion);
      return;
    }

    elapsed.current = Math.min(2.2, elapsed.current + delta);
    const t = elapsed.current / 2.2;
    const travel = 1 - (1 - t) ** 3;
    const x = MathUtils.lerp(startX, endX, travel);
    const z = MathUtils.lerp(index === 0 ? -.55 : .55, endZ, travel);
    const fall = Math.min(1, t / .54);
    let y = MathUtils.lerp(5.2 + index * .55, .73, fall * fall);

    if (t > .54) {
      const bounceT = (t - .54) / .46;
      y = .73 + Math.abs(Math.sin(bounceT * Math.PI * 3.1)) * (1 - bounceT) * 1.15;
    }

    group.current.position.set(x, y, z);

    if (t < .72) {
      const spin = new Quaternion().setFromEuler(new Euler(
        7.1 * (t / .72) + rollId * .17 + index,
        8.4 * (t / .72) + rollId * .13,
        6.6 * (t / .72) + index * 1.4,
      ));
      group.current.quaternion.copy(spin);
    } else {
      const settle = MathUtils.smoothstep((t - .72) / .28, 0, 1);
      group.current.quaternion.copy(spinEnd).slerp(finalQuaternion, settle);
    }

    if (t >= 1) {
      group.current.position.set(endX, .73, endZ);
      group.current.quaternion.copy(finalQuaternion);
      if (!reported.current) {
        reported.current = true;
        onSettled(index);
      }
    }
  });

  return (
    <group ref={group} scale={1.35}>
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
