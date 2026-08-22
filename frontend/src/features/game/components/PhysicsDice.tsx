import { RoundedBox } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  CuboidCollider,
  Physics,
  RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, Quaternion, Vector3 } from 'three';

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

const FACE_NORMALS = [
  { value: 1, normal: new Vector3(0, 1, 0) },
  { value: 6, normal: new Vector3(0, -1, 0) },
  { value: 2, normal: new Vector3(1, 0, 0) },
  { value: 5, normal: new Vector3(-1, 0, 0) },
  { value: 3, normal: new Vector3(0, 0, 1) },
  { value: 4, normal: new Vector3(0, 0, -1) },
] as const;

const DIE_SCALE = 1.02;
const DIE_HALF_EXTENT = .55;
const FLOOR_Y = -.04;

type Vec3Tuple = [number, number, number];
type QuaternionTuple = [number, number, number, number];

interface PlannedDie {
  value: number;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
  modelRotation: QuaternionTuple;
  isStatic?: boolean;
}

interface ThrowPlan {
  id: number;
  seed: number;
  dice: PlannedDie[];
}

interface Props {
  values: [number, number];
  rollId: number;
  onRollingChange?: (rolling: boolean) => void;
}

export function PhysicsDice({ values, rollId, onRollingChange }: Props) {
  const [firstValue, secondValue] = values;
  const activeValues = useMemo(
    () => [firstValue, secondValue].filter((value) => value >= 1 && value <= 6),
    [firstValue, secondValue],
  );
  const [plan, setPlan] = useState<ThrowPlan | null>(null);
  const settled = useRef(new Set<number>());
  const seed = useMemo(
    () => ((rollId * 1_103_515_245) ^ (firstValue * 12_345) ^ (secondValue * 2_654_435_761)) >>> 0,
    // A server roll always produces the same visual plan after a React re-render.
    [rollId, firstValue, secondValue],
  );

  useEffect(() => {
    settled.current.clear();
    setPlan(null);
    onRollingChange?.(rollId > 0);
  }, [rollId, firstValue, secondValue, onRollingChange]);

  const markSettled = useCallback((index: number) => {
    settled.current.add(index);
    if (settled.current.size === activeValues.length) onRollingChange?.(false);
  }, [activeValues.length, onRollingChange]);

  const staticPlan = useMemo<ThrowPlan>(() => ({
    id: 0,
    seed: 0,
    dice: activeValues.map((value, index) => ({
      value,
      position: [index === 0 ? -.72 : .72, DIE_HALF_EXTENT + FLOOR_Y + .01, index === 0 ? .08 : -.08],
      rotation: [0, 0, 0],
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      modelRotation: quaternionTuple(targetRotation(value, index === 0 ? -.35 : .35)),
      isStatic: true,
    })),
  }), [activeValues]);

  const visiblePlan = rollId === 0 ? staticPlan : plan?.id === rollId ? plan : null;

  return (
    <div className="physics-dice" aria-label={`Dice showing ${activeValues.join(' and ')}`}>
      <Canvas
        shadows
        dpr={[1, 2]}
        style={{ pointerEvents: 'none' }}
        camera={{ position: [0, 6.2, 7.7], fov: 29, near: .1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(0, .55, 0)}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={1.12} />
          <directionalLight
            castShadow
            position={[-4, 8, 5]}
            intensity={2.45}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <pointLight position={[4, 4, 4]} intensity={18} distance={12} color="#fff3d3" />
          <Physics key={rollId} gravity={[0, -18, 0]} timeStep={1 / 60}>
            {rollId > 0 && !visiblePlan && (
              <ThrowPlanner rollId={rollId} seed={seed} values={activeValues} onPlan={setPlan} />
            )}
            <DiceWorld plan={visiblePlan} onSettled={markSettled} />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
}

function ThrowPlanner({
  rollId,
  seed,
  values,
  onPlan,
}: {
  rollId: number;
  seed: number;
  values: number[];
  onPlan: (plan: ThrowPlan) => void;
}) {
  const { rapier } = useRapier();

  useEffect(() => {
    onPlan(buildThrowPlan(rapier, rollId, seed, values));
  }, [onPlan, rapier, rollId, seed, values]);

  return null;
}

function DiceWorld({ plan, onSettled }: { plan: ThrowPlan | null; onSettled: (index: number) => void }) {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[3.7, .08, 2.3]} position={[0, FLOOR_Y - .08, 0]} friction={.86} restitution={.28} />
        <CuboidCollider args={[.08, .72, 2.3]} position={[-3.78, .6, 0]} restitution={.42} />
        <CuboidCollider args={[.08, .72, 2.3]} position={[3.78, .6, 0]} restitution={.42} />
        <CuboidCollider args={[3.7, .72, .08]} position={[0, .6, -2.38]} restitution={.42} />
        <CuboidCollider args={[3.7, .72, .08]} position={[0, .6, 2.38]} restitution={.42} />
      </RigidBody>
      <mesh receiveShadow position={[0, FLOOR_Y + .005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 4.3]} />
        <shadowMaterial transparent opacity={.08} />
      </mesh>
      {plan?.dice.map((die, index) => (
        <PhysicsDie key={`${plan.id}-${plan.seed}-${index}`} index={index} die={die} onSettled={onSettled} />
      ))}
    </>
  );
}

function PhysicsDie({ index, die, onSettled }: { index: number; die: PlannedDie; onSettled: (index: number) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reported = useRef(false);
  const modelQuaternion = useMemo(
    () => new Quaternion(die.modelRotation[0], die.modelRotation[1], die.modelRotation[2], die.modelRotation[3]),
    [die.modelRotation],
  );

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const handleSleep = () => {
    if (die.isStatic || reported.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (!body.current?.isSleeping() || reported.current) return;
      reported.current = true;
      onSettled(index);
    }, 280);
  };

  const handleWake = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  };

  return (
    <RigidBody
      ref={body}
      type={die.isStatic ? 'fixed' : 'dynamic'}
      colliders={false}
      position={die.position}
      rotation={die.rotation}
      linearVelocity={die.linearVelocity}
      angularVelocity={die.angularVelocity}
      linearDamping={.28}
      angularDamping={.34}
      canSleep
      ccd
      onSleep={handleSleep}
      onWake={handleWake}
    >
      <CuboidCollider args={[DIE_HALF_EXTENT, DIE_HALF_EXTENT, DIE_HALF_EXTENT]} friction={.82} restitution={.48} density={1.1} />
      <DieModel modelQuaternion={modelQuaternion} />
    </RigidBody>
  );
}

function DieModel({ modelQuaternion = new Quaternion() }: { modelQuaternion?: Quaternion }) {
  return (
    <group scale={DIE_SCALE} quaternion={modelQuaternion}>
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

function buildThrowPlan(rapier: ReturnType<typeof useRapier>['rapier'], rollId: number, seed: number, values: number[]): ThrowPlan {
  let bestPlan: ThrowPlan | null = null;
  let bestAlignment = -Infinity;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const random = mulberry32(seed + attempt * 0x9e3779b9);
    const dice = values.map((value, index): PlannedDie => {
      const direction = index === 0 ? -1 : 1;
      return {
        value,
        position: [direction * (1.25 + random() * .22), 3.45 + random() * .65, -direction * (.45 + random() * .28)],
        rotation: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2],
        linearVelocity: [-direction * (.35 + random() * .55), -.8 + random(), direction * (.25 + random() * .55)],
        angularVelocity: [
          -direction * (8 + random() * 7),
          direction * (8 + random() * 7),
          -direction * (7 + random() * 7),
        ],
        modelRotation: [0, 0, 0, 1],
      };
    });

    const prediction = simulateThrow(rapier, dice);
    const minimumAlignment = Math.min(...prediction.map((result) => result.alignment));
    const plannedDice = dice.map((die, index) => {
      const desiredNormal = FACE_NORMALS.find((face) => face.value === die.value)!.normal;
      const modelRotation = new Quaternion().setFromUnitVectors(desiredNormal, prediction[index].topNormal);
      return { ...die, modelRotation: quaternionTuple(modelRotation) };
    });
    const candidate = { id: rollId, seed: seed + attempt, dice: plannedDice };

    if (minimumAlignment > bestAlignment) {
      bestAlignment = minimumAlignment;
      bestPlan = candidate;
    }
    if (minimumAlignment >= .985) return candidate;
  }

  return bestPlan!;
}

function simulateThrow(rapier: ReturnType<typeof useRapier>['rapier'], dice: PlannedDie[]) {
  const world = new rapier.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / 60;
  const fixed = world.createRigidBody(rapier.RigidBodyDesc.fixed());

  world.createCollider(
    rapier.ColliderDesc.cuboid(3.7, .08, 2.3).setTranslation(0, FLOOR_Y - .08, 0).setFriction(.86).setRestitution(.28),
    fixed,
  );
  world.createCollider(rapier.ColliderDesc.cuboid(.08, .72, 2.3).setTranslation(-3.78, .6, 0).setRestitution(.42), fixed);
  world.createCollider(rapier.ColliderDesc.cuboid(.08, .72, 2.3).setTranslation(3.78, .6, 0).setRestitution(.42), fixed);
  world.createCollider(rapier.ColliderDesc.cuboid(3.7, .72, .08).setTranslation(0, .6, -2.38).setRestitution(.42), fixed);
  world.createCollider(rapier.ColliderDesc.cuboid(3.7, .72, .08).setTranslation(0, .6, 2.38).setRestitution(.42), fixed);

  const bodies = dice.map((die) => {
    const initialRotation = new Quaternion().setFromEuler(new Euler(...die.rotation));
    const descriptor = rapier.RigidBodyDesc.dynamic()
      .setTranslation(...die.position)
      .setRotation(initialRotation)
      .setLinvel(...die.linearVelocity)
      .setAngvel({ x: die.angularVelocity[0], y: die.angularVelocity[1], z: die.angularVelocity[2] })
      .setLinearDamping(.28)
      .setAngularDamping(.34)
      .setCanSleep(true)
      .setCcdEnabled(true);
    const body = world.createRigidBody(descriptor);
    world.createCollider(
      rapier.ColliderDesc.cuboid(DIE_HALF_EXTENT, DIE_HALF_EXTENT, DIE_HALF_EXTENT)
        .setFriction(.82)
        .setRestitution(.48)
        .setDensity(1.1),
      body,
    );
    return body;
  });

  for (let step = 0; step < 900; step += 1) {
    world.step();
    if (step > 90 && bodies.every((body) => body.isSleeping())) break;
  }

  const results = bodies.map((body) => {
    const rotation = body.rotation();
    const quaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    let topNormal = FACE_NORMALS[0].normal;
    let alignment = -Infinity;
    FACE_NORMALS.forEach(({ normal }) => {
      const height = normal.clone().applyQuaternion(quaternion).y;
      if (height > alignment) {
        alignment = height;
        topNormal = normal;
      }
    });
    return { topNormal: topNormal.clone(), alignment };
  });

  world.free();
  return results;
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

function quaternionTuple(quaternion: Quaternion): QuaternionTuple {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
