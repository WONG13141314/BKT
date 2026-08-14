import { RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Group, MathUtils, Mesh, MeshBasicMaterial, OrthographicCamera, Vector3 } from 'three';
import { Player } from '../types/game.types';

const BOARD_WORLD_SIZE = 10.05;

const GRID = [
  [6, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1],
  [5, 1], [4, 1], [3, 1], [2, 1],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 6], [3, 6], [4, 6], [5, 6],
];

// Four fixed bays centred inside every tile. Keeping the offsets symmetric
// prevents a full table from piling up on the inner board border at GO.
const TOKEN_BAYS: [number, number][] = [
  [-.34, -.27],
  [.34, -.27],
  [-.34, .27],
  [.34, .27],
];
const YAWS = { race_car: -.38, battleship: 0, top_hat: -.28, scottie_dog: -.34 };
// Ground offsets account for every model's tilted lowest vertex. This keeps
// wheels, hull, hat brim and paws just above the board instead of clipping.
const HEIGHTS = { race_car: .1, battleship: .12, top_hat: .21, scottie_dog: .12 };
const SCALES = { race_car: .27, battleship: .3, top_hat: .26, scottie_dog: .26 };
const SHADOW_SCALES = {
  race_car: [.27, .14],
  battleship: [.29, .15],
  top_hat: [.2, .15],
  scottie_dog: [.22, .16],
} as const;

function tokenBay(tileIndex: number, playerIndex: number): [number, number] {
  const [across, depth] = TOKEN_BAYS[playerIndex] ?? [0, 0];
  // Rotate the same 2x2 bay layout with the track. Every model remains fully
  // inside the physical tile instead of straddling the centre/edge border.
  if (tileIndex <= 5) return [across, depth];
  if (tileIndex <= 9) return [-depth, across];
  if (tileIndex <= 15) return [-across, -depth];
  return [depth, -across];
}

function boardPoint(tileIndex: number, playerIndex: number, z: number) {
  const [row, column] = GRID[tileIndex] ?? GRID[0];
  const [offsetX, offsetY] = tokenBay(tileIndex, playerIndex);
  const cell = BOARD_WORLD_SIZE / 6;
  return new Vector3((column - 3.5) * cell + offsetX, (3.5 - row) * cell + offsetY, z);
}

/** Keep the WebGL coordinate system aligned with the responsive CSS board. */
function ResponsiveBoardCamera() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    const orthographicCamera = camera as OrthographicCamera;
    orthographicCamera.zoom = Math.min(size.width, size.height) / BOARD_WORLD_SIZE;
    orthographicCamera.updateProjectionMatrix();
  }, [camera, size.height, size.width]);

  return null;
}

export function BoardPiecesScene({ players }: { players: Player[] }) {
  return (
    <div className="board-piece-layer" aria-label="Three-dimensional player tokens">
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        style={{ pointerEvents: 'none' }}
        camera={{ position: [0, 0, 12], zoom: 1, near: .1, far: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ResponsiveBoardCamera />
        <ambientLight intensity={.82} />
        <hemisphereLight args={['#fff8dc', '#315848', .92]} />
        <directionalLight castShadow position={[-5, 8, 10]} intensity={3.8} shadow-bias={-.0004} />
        <pointLight position={[5, 3, 8]} intensity={20} distance={18} color="#fff0c8" />
        <mesh position={[0, 0, .005]} receiveShadow>
          <planeGeometry args={[BOARD_WORLD_SIZE, BOARD_WORLD_SIZE]} />
          <shadowMaterial transparent opacity={.14} depthWrite={false} />
        </mesh>
        {players.map((player, index) => !player.isBankrupt && (
          <MovingToken key={player.id} player={player} playerIndex={index} />
        ))}
      </Canvas>
    </div>
  );
}

function MovingToken({ player, playerIndex }: { player: Player; playerIndex: number }) {
  const token = player.tokenType ?? 'race_car';
  const ground = HEIGHTS[token];
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const shadowMaterial = useRef<MeshBasicMaterial>(null);
  const from = useRef(boardPoint(player.position, playerIndex, ground));
  const to = useRef(boardPoint(player.position, playerIndex, ground));
  const progress = useRef(1);
  const lastPosition = useRef(player.position);
  const current = useMemo(() => new Vector3(), []);
  const shadowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(48, 48, 5, 48, 48, 46);
      gradient.addColorStop(0, 'rgba(0,0,0,.72)');
      gradient.addColorStop(.45, 'rgba(0,0,0,.4)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 96, 96);
    }
    return new CanvasTexture(canvas);
  }, []);

  useEffect(() => () => shadowTexture.dispose(), [shadowTexture]);

  useEffect(() => {
    if (lastPosition.current === player.position) return;
    from.current.copy(group.current?.position ?? boardPoint(lastPosition.current, playerIndex, ground));
    from.current.z = ground;
    to.current.copy(boardPoint(player.position, playerIndex, ground));
    progress.current = 0;
    lastPosition.current = player.position;
  }, [ground, player.position, playerIndex]);

  useFrame((_, delta) => {
    if (!group.current || !shadow.current) return;
    progress.current = Math.min(1, progress.current + delta / .22);
    const eased = MathUtils.smoothstep(progress.current, 0, 1);
    current.lerpVectors(from.current, to.current, eased);
    const hop = Math.sin(progress.current * Math.PI);
    current.z = ground + hop * .9;
    group.current.position.copy(current);
    group.current.rotation.x = .52 + hop * .035;
    group.current.rotation.y = YAWS[token];
    // Player pieces remain screen-upright on every board edge. Only their bay
    // coordinates rotate with the track; the models themselves never spin.
    group.current.rotation.z = 0;

    const [shadowX, shadowY] = SHADOW_SCALES[token];
    const spread = 1 + hop * .28;
    shadow.current.position.set(current.x, current.y, .016);
    shadow.current.scale.set(shadowX * spread, shadowY * spread, 1);
    if (shadowMaterial.current) shadowMaterial.current.opacity = .32 * (1 - hop * .58);
  });

  return (
    <>
      <mesh
        ref={shadow}
        position={boardPoint(player.position, playerIndex, .016).toArray()}
        scale={[SHADOW_SCALES[token][0], SHADOW_SCALES[token][1], 1]}
        renderOrder={2}
      >
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          ref={shadowMaterial}
          map={shadowTexture}
          transparent
          opacity={.32}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group
        ref={group}
        position={to.current.toArray()}
        scale={SCALES[token]}
        rotation={[.52, YAWS[token], 0]}
      >
        {token === 'battleship' ? <Battleship />
          : token === 'top_hat' ? <TopHat />
            : token === 'scottie_dog' ? <ScottieDog />
              : <RaceCar />}
      </group>
    </>
  );
}

function Silver({ roughness = .2 }: { roughness?: number }) {
  return <meshPhysicalMaterial color="#c8ccd0" metalness={.88} roughness={roughness} clearcoat={.42} />;
}

function RaceCar() {
  return (
    <group>
      <RoundedBox args={[1.28, .28, .55]} radius={.12} smoothness={4} castShadow><Silver roughness={.16} /></RoundedBox>
      <mesh position={[-.64, .02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><coneGeometry args={[.28, .34, 18]} /><Silver /></mesh>
      <RoundedBox args={[.52, .32, .45]} radius={.1} smoothness={4} position={[.16, .25, 0]} castShadow><Silver /></RoundedBox>
      {[-.42, .4].flatMap((x) => [-.32, .32].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -.16, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[.18, .18, .13, 24]} /><meshPhysicalMaterial color="#777d82" metalness={.9} roughness={.25} />
        </mesh>
      )))}
    </group>
  );
}

function Battleship() {
  return (
    <group>
      <RoundedBox args={[1.38, .38, .54]} radius={.12} smoothness={4} castShadow><Silver /></RoundedBox>
      <mesh position={[.78, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow><coneGeometry args={[.31, .4, 16]} /><Silver /></mesh>
      <RoundedBox args={[.36, .42, .36]} radius={.06} smoothness={3} position={[-.05, .46, 0]} castShadow><Silver /></RoundedBox>
      {[-.3, -.54].map((x) => <mesh key={x} position={[x, .68, 0]} castShadow><cylinderGeometry args={[.13, .16, .46, 18]} /><Silver /></mesh>)}
      <mesh position={[-.05, 1.02, 0]} castShadow><cylinderGeometry args={[.035, .035, .78, 10]} /><Silver /></mesh>
      {[-.48, -.24, 0, .24, .48].map((x) => <mesh key={x} position={[x, .02, .278]}><circleGeometry args={[.04, 14]} /><meshStandardMaterial color="#51575c" metalness={.7} /></mesh>)}
    </group>
  );
}

function TopHat() {
  return (
    <group>
      <mesh position={[0, -.18, 0]} castShadow><cylinderGeometry args={[.72, .72, .14, 36]} /><Silver /></mesh>
      <mesh position={[0, .42, 0]} castShadow><cylinderGeometry args={[.46, .53, 1.16, 36]} /><Silver roughness={.15} /></mesh>
      <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[.39, .055, 12, 32]} /><Silver /></mesh>
    </group>
  );
}

function ScottieDog() {
  return (
    <group>
      <mesh position={[0, .3, 0]} scale={[.86, .48, .48]} castShadow><sphereGeometry args={[.62, 24, 18]} /><Silver roughness={.25} /></mesh>
      <mesh position={[-.5, .73, 0]} scale={[.7, .75, .65]} castShadow><sphereGeometry args={[.42, 24, 18]} /><Silver /></mesh>
      <mesh position={[-.78, .62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><coneGeometry args={[.2, .42, 16]} /><Silver /></mesh>
      {[-.68, -.31].map((x) => <mesh key={x} position={[x, 1.1, 0]} castShadow><coneGeometry args={[.16, .4, 4]} /><Silver /></mesh>)}
      {[-.38, .36].flatMap((x) => [-.24, .24].map((z) => <mesh key={`${x}-${z}`} position={[x, -.18, z]} castShadow><cylinderGeometry args={[.12, .16, .75, 16]} /><Silver /></mesh>))}
      <mesh position={[.62, .62, 0]} rotation={[0, 0, -.72]} castShadow><torusGeometry args={[.38, .09, 12, 28, Math.PI * 1.2]} /><Silver /></mesh>
    </group>
  );
}
