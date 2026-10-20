import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, Suspense, useEffect, useMemo, useRef } from 'react';
import { ExtrudeGeometry, Group, MathUtils, MeshStandardMaterial, NeutralToneMapping, Shape, Vector3 } from 'three';
import type { Player, PropertyState, TileConfig } from '../../types/game.types';
import { COLOR_GROUP_PRESENTATION } from '../../config/board.presentation';
import { SceneReady } from '../BoardRendering';
import { PhysicsDiceContent } from '../PhysicsDice';
import { TOKEN_HOP_SECONDS } from '../board.animation';
import {
  BAND_DEPTH, BOARD_HALF, forwardSteps, nearestSide, sideProgress, TILE_DEPTH, TILE_GAP, TILE_TOP,
  tilePlacement, tokenSpot, travelYaw, rotateOffset,
} from './board.layout';
import { CameraRig, type TokenMotion } from './CameraRig';
import type { CameraMode, SafeInsets } from './camera';
import { makeCardBackTexture, makeCentreTexture, makeFeltTexture, makeTileTexture, SPACE_COLOURS } from './tile.textures';
import { TokenModel } from './TokenModels';

export interface TabletopSceneProps {
  players: Player[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  selectedTile: number;
  /** The space the moving piece has just reached; it flashes briefly. */
  stepTile: { index: number; id: number } | null;
  dice: {
    values: [number, number];
    rollId: number;
    animate: boolean;
    onRollingChange: (rolling: boolean) => void;
    onReady: () => void;
  };
  cameraMode: CameraMode;
  insets: SafeInsets;
  reducedMotion: boolean;
  onTileSelect: (index: number) => void;
  onReady: () => void;
}

const CENTRE_SIZE = (BOARD_HALF - TILE_DEPTH) * 2;
const CENTRE_TOP = 0.06;
const TOKEN_SCALE = 0.86;
// Resting pieces turn a little towards the outside, so they show their profile.
const REST_TURN = 0.45;

export function TabletopScene(props: TabletopSceneProps) {
  return (
    <Canvas
      className="tabletop-canvas"
      shadows="percentage"
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ position: [0, 18, 16], fov: 38, near: 0.2, far: 160 }}
      gl={{ antialias: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
    >
      <TabletopWorld {...props} />
    </Canvas>
  );
}

function TabletopWorld(props: TabletopSceneProps) {
  const motion = useRef(new Map<string, TokenMotion>());
  const active = props.players[props.currentPlayerIndex];
  // Which pieces share a space, so each can step aside for the others.
  const slots = useMemo(() => {
    const byTile = new Map<number, string[]>();
    props.players.filter((player) => !player.isBankrupt).forEach((player) => {
      byTile.set(player.position, [...(byTile.get(player.position) ?? []), player.id]);
    });
    return new Map([...byTile.values()].flatMap((ids) => ids.map((id, slot) => [id, { slot, count: ids.length }] as const)));
  }, [props.players]);

  return (
    <>
      <TableLighting />
      <Table />
      <BoardBody />
      {props.tiles.map((tile) => (
        <BoardSpace key={tile.index} tile={tile} onSelect={props.onTileSelect} />
      ))}
      <Ownership tiles={props.tiles} properties={props.properties} players={props.players} />
      <SelectionFrame index={props.selectedTile} />
      {props.stepTile && <StepFlash key={props.stepTile.id} index={props.stepTile.index} />}
      <CardDeck />

      <group position={[0, CENTRE_TOP + 0.04, 0]}>
        <PhysicsDiceContent
          values={props.dice.values}
          rollId={props.dice.rollId}
          animate={props.dice.animate}
          onRollingChange={props.dice.onRollingChange}
          onReady={props.dice.onReady}
        />
      </group>

      {props.players.map((player) => {
        if (player.isBankrupt) return null;
        const place = slots.get(player.id) ?? { slot: 0, count: 1 };
        return (
          <TokenPiece
            key={player.id}
            player={player}
            slot={place.slot}
            count={place.count}
            active={player.id === active?.id}
            motion={motion.current}
            reducedMotion={props.reducedMotion}
          />
        );
      })}

      <CameraRig
        mode={props.cameraMode}
        focusId={active?.id}
        restingTrack={active?.position ?? 0}
        insets={props.insets}
        reducedMotion={props.reducedMotion}
        motion={motion.current}
      />
      <SceneReady onReady={props.onReady} />
    </>
  );
}

/** Shared by the game table and the token lookbook. */
export function TableLighting() {
  return (
    <>
      <color attach="background" args={['#103024']} />
      <fog attach="fog" args={['#103024', 60, 150]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#fff7e6', '#1d4634', 0.75]} />
      <directionalLight
        castShadow
        position={[-7, 16, 9]}
        intensity={2.6}
        color="#fff4e0"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={3}
      />
      <Suspense fallback={null}>
        {/* Studio reflections for the pewter, built locally: no download. */}
        <Environment resolution={128} frames={1}>
          <color attach="background" args={['#9aa59f']} />
          <Lightformer intensity={3} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
          <Lightformer intensity={2.2} position={[-8, 3, 5]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} color="#fff1d6" />
          <Lightformer intensity={1.8} position={[8, 3, -5]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} color="#e6f4ee" />
          <Lightformer intensity={1.6} position={[0, 3, 9]} scale={[12, 4, 1]} color="#ffffff" />
          <Lightformer intensity={0.6} position={[0, -2, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color="#2b5a45" />
        </Environment>
      </Suspense>
    </>
  );
}

const Table = memo(function Table() {
  const felt = useMemo(() => makeFeltTexture(), []);
  useEffect(() => () => felt.dispose(), [felt]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.62, 0]} receiveShadow>
      <planeGeometry args={[160, 160]} />
      <meshStandardMaterial map={felt} roughness={0.95} color="#ffffff" />
    </mesh>
  );
});

const BoardBody = memo(function BoardBody() {
  const centre = useMemo(() => makeCentreTexture(), []);
  useEffect(() => () => centre.dispose(), [centre]);
  const edge = BOARD_HALF * 2 + 0.5;
  return (
    <group>
      {/* A thick lacquered board; the dark top shows between spaces as the printed rule lines. */}
      <RoundedBox args={[edge, 0.6, edge]} radius={0.14} smoothness={4} position={[0, -0.3, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#161d19" roughness={0.42} clearcoat={0.6} clearcoatRoughness={0.35} />
      </RoundedBox>
      {/* The recessed centre. Dice shadows fall on their own catcher, so the
          printed field skips shadow sampling and keeps its edges clean. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, CENTRE_TOP, 0]}>
        <planeGeometry args={[CENTRE_SIZE - TILE_GAP, CENTRE_SIZE - TILE_GAP]} />
        <meshStandardMaterial map={centre} roughness={0.85} />
      </mesh>
    </group>
  );
});

const SPACE_HEIGHT = 0.14;

const BoardSpace = memo(function BoardSpace({ tile, onSelect }: { tile: TileConfig; onSelect: (index: number) => void }) {
  const place = tilePlacement(tile.index);
  const groupColour = tile.colorGroup ? COLOR_GROUP_PRESENTATION[tile.colorGroup] ?? null : null;
  const texture = useMemo(
    () => makeTileTexture(tile, place.corner, groupColour),
    // Prices and names are fixed for the match; ownership updates must not redraw faces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tile.index, tile.type, tile.name, tile.price, tile.colorGroup, tile.skillTheme, place.corner, groupColour],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const width = place.width - TILE_GAP;
  const depth = place.depth - TILE_GAP;
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(tile.index);
  };
  const setCursor = (cursor: string) => () => { document.body.style.cursor = cursor; };

  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.yaw}>
      <RoundedBox
        args={[width, SPACE_HEIGHT, depth]}
        radius={0.035}
        smoothness={3}
        position={[0, TILE_TOP - SPACE_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
        onClick={select}
        onPointerOver={setCursor('pointer')}
        onPointerOut={setCursor('')}
      >
        <meshStandardMaterial color={SPACE_COLOURS[tile.type] ?? SPACE_COLOURS.PROPERTY} roughness={0.7} />
      </RoundedBox>
      <mesh rotation-x={-Math.PI / 2} position={[0, TILE_TOP + 0.002, 0]} receiveShadow>
        <planeGeometry args={[width - 0.04, depth - 0.04]} />
        <meshStandardMaterial map={texture} roughness={0.72} />
      </mesh>
      {groupColour && !place.corner && (
        <RoundedBox
          args={[width - 0.08, 0.05, BAND_DEPTH - 0.06]}
          radius={0.02}
          smoothness={2}
          position={[0, TILE_TOP + 0.02, -depth / 2 + BAND_DEPTH / 2]}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial color={groupColour} roughness={0.35} clearcoat={0.8} clearcoatRoughness={0.25} />
        </RoundedBox>
      )}
    </group>
  );
});

let houseGeometry: { body: ExtrudeGeometry; roof: ExtrudeGeometry } | null = null;
function house() {
  if (houseGeometry) return houseGeometry;
  const body = new Shape();
  body.moveTo(-0.17, 0);
  body.lineTo(0.17, 0);
  body.lineTo(0.17, 0.2);
  body.lineTo(-0.17, 0.2);
  body.closePath();
  const roof = new Shape();
  roof.moveTo(-0.21, 0.19);
  roof.lineTo(0.21, 0.19);
  roof.lineTo(0, 0.36);
  roof.closePath();
  const options = { depth: 0.26, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 };
  houseGeometry = {
    body: new ExtrudeGeometry(body, options).translate(0, 0, -0.13),
    roof: new ExtrudeGeometry(roof, { ...options, depth: 0.3 }).translate(0, 0, -0.15),
  };
  return houseGeometry;
}
const HOUSE_MATERIAL = new MeshStandardMaterial({ color: '#1f9d55', roughness: 0.4, metalness: 0.05 });
const ROOF_MATERIAL = new MeshStandardMaterial({ color: '#17824a', roughness: 0.45 });

/** Owner strips along each owned space's outer edge, and a house for a Level Up. */
function Ownership({ tiles, properties, players }: { tiles: TileConfig[]; properties: PropertyState[]; players: Player[] }) {
  const geometry = house();
  return (
    <>
      {properties.map((property) => {
        const tile = tiles[property.tileIndex];
        const owner = players.find((player) => player.id === property.ownerId);
        if (!tile || (!owner && !property.isLeveledUp)) return null;
        const place = tilePlacement(tile.index);
        const width = place.width - TILE_GAP;
        const depth = place.depth - TILE_GAP;
        return (
          <group key={property.tileIndex} position={[place.x, 0, place.z]} rotation-y={place.yaw}>
            {owner && (
              <RoundedBox args={[width - 0.14, 0.035, 0.2]} radius={0.015} smoothness={2} position={[0, TILE_TOP + 0.01, depth / 2 - 0.18]} receiveShadow>
                <meshStandardMaterial color={owner.color} emissive={owner.color} emissiveIntensity={0.25} roughness={0.5} />
              </RoundedBox>
            )}
            {property.isLeveledUp && (
              <group position={[0, TILE_TOP + 0.045, -depth / 2 + BAND_DEPTH / 2]} rotation-y={Math.PI / 2}>
                <mesh geometry={geometry.body} material={HOUSE_MATERIAL} castShadow />
                <mesh geometry={geometry.roof} material={ROOF_MATERIAL} castShadow />
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

/** A soft gold frame around the space shown in the details card. */
function SelectionFrame({ index }: { index: number }) {
  const place = tilePlacement(index);
  const width = place.width - TILE_GAP + 0.02;
  const depth = place.depth - TILE_GAP + 0.02;
  const bar = 0.09;
  const bars: [number, number, number, number][] = [
    [0, -depth / 2 + bar / 2, width, bar], [0, depth / 2 - bar / 2, width, bar],
    [-width / 2 + bar / 2, 0, bar, depth], [width / 2 - bar / 2, 0, bar, depth],
  ];
  return (
    <group position={[place.x, TILE_TOP + 0.05, place.z]} rotation-y={place.yaw}>
      {bars.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[w, 0.03, d]} />
          <meshStandardMaterial color="#ffbd19" emissive="#ffbd19" emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Each visited space lights up briefly as the piece touches down. */
function StepFlash({ index }: { index: number }) {
  const place = tilePlacement(index);
  const material = useRef<MeshStandardMaterial>(null);
  const started = useRef(performance.now());
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    const t = (performance.now() - started.current) / 520;
    if (material.current) material.current.opacity = Math.max(0, 0.55 * (1 - t));
    if (t < 1) invalidate();
  });
  return (
    <mesh position={[place.x, TILE_TOP + 0.03, place.z]} rotation-x={-Math.PI / 2} rotation-z={place.yaw}>
      <planeGeometry args={[place.width - TILE_GAP - 0.06, place.depth - TILE_GAP - 0.06]} />
      <meshStandardMaterial ref={material} color="#ffffff" emissive="#fff6d0" emissiveIntensity={1} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const CardDeck = memo(function CardDeck() {
  const face = useMemo(() => makeCardBackTexture(), []);
  useEffect(() => () => face.dispose(), [face]);
  const [x, z] = rotateOffset(-2.65, -2.85, 0);
  return (
    <group position={[x, CENTRE_TOP, z]} rotation-y={Math.PI / 4}>
      {Array.from({ length: 7 }, (_, i) => (
        <RoundedBox key={i} args={[1.05, 0.03, 1.4]} radius={0.012} smoothness={2} position={[(i % 2) * 0.012, 0.016 + i * 0.032, (i % 3) * 0.01]} rotation-y={(i % 3 - 1) * 0.02} castShadow receiveShadow>
          <meshStandardMaterial color="#f4f0ff" roughness={0.6} />
        </RoundedBox>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.016 + 7 * 0.032 + 0.001, 0]}>
        <planeGeometry args={[1.0, 1.35]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
    </group>
  );
});

interface PieceState {
  index: number;
  liveTrack: number;
  from: Vector3;
  to: Vector3;
  live: Vector3;
  trackFrom: number;
  trackTo: number;
  start: number;
  duration: number;
  height: number;
  lastHop: number;
  yaw: number;
}

function TokenPiece({ player, slot, count, active, motion, reducedMotion }: {
  player: Player;
  slot: number;
  count: number;
  active: boolean;
  motion: Map<string, TokenMotion>;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<MeshStandardMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [spotX, spotZ] = tokenSpot(player.position, slot, count);
  const piece = useRef<PieceState | null>(null);
  if (!piece.current) {
    const start = new Vector3(spotX, 0, spotZ);
    const track = player.position;
    piece.current = {
      index: player.position, liveTrack: track, from: start.clone(), to: start.clone(), live: start.clone(),
      trackFrom: track, trackTo: track, start: -1, duration: 0, height: 0, lastHop: -Infinity,
      yaw: travelYaw(sideProgress(track)) + REST_TURN,
    };
  }

  useEffect(() => {
    const state = piece.current!;
    const now = performance.now();
    state.to.set(spotX, 0, spotZ);
    if (state.index !== player.position) {
      const walk = forwardSteps(state.index, player.position) === 1;
      state.from.copy(state.live);
      state.trackFrom = state.liveTrack;
      // Ordinary moves step forward one space; card moves and jail transfers relocate directly.
      // Count from the pending target: a throttled tab can deliver a step before the last hop drew.
      state.trackTo = walk ? state.trackTo + 1 : nearestSide(player.position / 5, state.trackTo / 5) * 5;
      state.duration = reducedMotion ? 0.12 : walk ? TOKEN_HOP_SECONDS : 0.55;
      state.height = reducedMotion ? 0.05 : walk ? 0.7 : 2.1;
      state.start = now;
      state.index = player.position;
    }
    invalidate();
  }, [invalidate, player.position, reducedMotion, spotX, spotZ]);

  // A small hello hop marks the start of this player's turn.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && !reducedMotion) {
      const state = piece.current!;
      if (state.start < 0) {
        state.from.copy(state.live);
        state.trackFrom = state.trackTo = state.liveTrack;
        state.duration = 0.34;
        state.height = 0.35;
        state.start = performance.now();
      }
    }
    wasActive.current = active;
    invalidate();
  }, [active, invalidate, reducedMotion]);

  useFrame((_, delta) => {
    const state = piece.current!;
    const now = performance.now();
    let animating = false;
    let lift = 0;
    let squash = 1;
    if (state.start >= 0) {
      const t = Math.min(1, (now - state.start) / (state.duration * 1000));
      const eased = MathUtils.smoothstep(t, 0, 1);
      state.live.lerpVectors(state.from, state.to, eased);
      state.liveTrack = MathUtils.lerp(state.trackFrom, state.trackTo, eased);
      lift = Math.sin(Math.PI * t) * state.height;
      squash = 1 + 0.07 * Math.sin(Math.PI * t);
      if (t >= 1) {
        state.start = -1;
        state.liveTrack = state.trackTo;
        state.lastHop = now;
      }
      animating = true;
    } else {
      const k = 1 - Math.exp(-delta * 12);
      state.live.lerp(state.to, k);
      if (state.live.distanceToSquared(state.to) > 1e-6) animating = true;
      // Touch-down squash shortly after landing.
      const since = (now - state.lastHop) / 160;
      if (since < 1) {
        squash = 1 - 0.09 * Math.sin(Math.PI * since);
        animating = true;
      }
    }
    const travelling = state.start >= 0 || now - state.lastHop < 650;
    const targetYaw = travelYaw(sideProgress(state.liveTrack)) + (travelling ? 0 : REST_TURN);
    const yawStep = 1 - Math.exp(-delta * (travelling ? 16 : 5));
    state.yaw = MathUtils.lerp(state.yaw, targetYaw, yawStep);
    if (Math.abs(state.yaw - targetYaw) > 1e-3) animating = true;
    else if (!travelling && now - state.lastHop < 700) animating = true;

    if (group.current) {
      group.current.position.set(state.live.x, TILE_TOP, state.live.z);
    }
    if (body.current) {
      body.current.position.y = lift;
      body.current.rotation.y = state.yaw;
      body.current.scale.set(TOKEN_SCALE / Math.sqrt(squash), TOKEN_SCALE * squash, TOKEN_SCALE / Math.sqrt(squash));
    }
    if (ring.current) ring.current.emissiveIntensity = active ? 0.9 : 0.15;
    motion.set(player.id, { x: state.live.x, z: state.live.z, track: state.liveTrack, moving: state.start >= 0 });
    if (animating) invalidate();
  });

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} scale={active ? 1.08 : 1}>
        <torusGeometry args={[0.36, 0.032, 10, 40]} />
        <meshStandardMaterial ref={ring} color={player.color} emissive={player.color} emissiveIntensity={active ? 0.9 : 0.15} roughness={0.4} />
      </mesh>
      <group ref={body}>
        <TokenModel token={player.tokenType} />
      </group>
    </group>
  );
}
