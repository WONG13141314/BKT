import { RoundedBox } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  CuboidCollider,
  Physics,
  RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Quaternion } from 'three';
import { DICE_ROLL_LIMIT_MS } from './board.animation';
import { buildThrowPlan, PlannedDie, restingRotation, ThrowPlan } from './dice.throw';

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
const FLOOR_Y = -.04;

interface Props {
  values: [number, number];
  rollId: number;
  /** The board can finish a roll even while this lazy-loaded scene is loading. */
  animate?: boolean;
  onRollingChange?: (rolling: boolean) => void;
}

export function PhysicsDice({ values, rollId, animate = true, onRollingChange }: Props) {
  const [firstValue, secondValue] = values;
  const activeValues = useMemo(
    () => [firstValue, secondValue].filter((value) => value >= 1 && value <= 6),
    [firstValue, secondValue],
  );
  const [completedRollId, setCompletedRollId] = useState(0);
  const [restingRollId, setRestingRollId] = useState(0);
  const completedRollRef = useRef(0);
  const activeRollRef = useRef(rollId);
  const rollingCallback = useRef(onRollingChange);
  activeRollRef.current = rollId;
  rollingCallback.current = onRollingChange;
  const settled = useRef(new Set<number>());
  const seed = useMemo(
    () => ((rollId * 1_103_515_245) ^ (firstValue * 12_345) ^ (secondValue * 2_654_435_761)) >>> 0,
    // A server roll always produces the same visual plan after a React re-render.
    [rollId, firstValue, secondValue],
  );

  const plan = useMemo(() => buildThrowPlan(rollId, seed, activeValues), [rollId, seed, activeValues]);
  const rolling = animate && rollId > 0 && completedRollId !== rollId;

  const finishRoll = useCallback((forceRest: boolean) => {
    if (activeRollRef.current !== rollId || completedRollRef.current === rollId) return;
    completedRollRef.current = rollId;
    if (forceRest) setRestingRollId(rollId);
    setCompletedRollId(rollId);
    rollingCallback.current?.(false);
  }, [rollId]);

  useEffect(() => {
    settled.current.clear();
    if (rollId === 0) return;
    rollingCallback.current?.(true);
    // Background tabs and lost WebGL frames may never emit Rapier's sleep event.
    const timer = setTimeout(() => finishRoll(true), DICE_ROLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [rollId, finishRoll]);

  useEffect(() => {
    if (!animate) finishRoll(true);
  }, [animate, finishRoll]);

  const markSettled = useCallback((index: number) => {
    settled.current.add(index);
    if (settled.current.size === activeValues.length) finishRoll(false);
  }, [activeValues.length, finishRoll]);
  const markAwake = useCallback((index: number) => {
    settled.current.delete(index);
  }, []);

  const staticPlan = useMemo<ThrowPlan>(() => ({
    id: rollId,
    seed: 0,
    dice: activeValues.map((value, index) => ({
      value,
      position: [index === 0 ? -.72 : .72, DIE_HALF_EXTENT + FLOOR_Y + .01, index === 0 ? .08 : -.08],
      rotation: [0, 0, 0],
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      modelRotation: restingRotation(value, index === 0 ? -.35 : .35),
      isStatic: true,
    })),
  }), [activeValues, rollId]);

  const visiblePlan = rollId === 0 || restingRollId === rollId ? staticPlan : plan;

  return (
    <div className="physics-dice" aria-label={`Dice showing ${activeValues.join(' and ')}`}>
      <Canvas
        shadows="percentage"
        frameloop={rolling ? 'always' : 'demand'}
        dpr={[1, 1.5]}
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
          <Physics key={`${rollId}-${restingRollId === rollId}`} paused={!rolling} gravity={[0, -18, 0]} timeStep={1 / 60}>
            <DiceWorld plan={visiblePlan} onSettled={markSettled} onAwake={markAwake} />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
}

function DiceWorld({ plan, onSettled, onAwake }: { plan: ThrowPlan; onSettled: (index: number) => void; onAwake: (index: number) => void }) {
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
      {plan.dice.map((die, index) => (
        <PhysicsDie key={`${plan.id}-${plan.seed}-${index}`} index={index} die={die} onSettled={onSettled} onAwake={onAwake} />
      ))}
    </>
  );
}

function PhysicsDie({ index, die, onSettled, onAwake }: { index: number; die: PlannedDie; onSettled: (index: number) => void; onAwake: (index: number) => void }) {
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
    reported.current = false;
    onAwake(index);
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
