import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, Suspense, useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending, ExtrudeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NeutralToneMapping, Shape, Vector3,
} from 'three';
import type { Player, PropertyState, TileConfig } from '../../types/game.types';
import { COLOR_GROUP_PRESENTATION } from '../../config/board.presentation';
import { SceneReady } from '../BoardRendering';
import { PhysicsDiceContent } from '../PhysicsDice';
import { TOKEN_HOP_SECONDS } from '../board.animation';
import {
  BAND_DEPTH, BOARD_HALF, CENTRE_SIZE, forwardSteps, SURFACE_Y, TILE_COUNT, TILE_GAP,
  tilePlacement, tokenSpot, travelYaw,
} from './board.layout';
import { CameraRig, type TokenMotion } from './CameraRig';
import { springStep, type CameraMode, type SafeInsets } from './camera';
import {
  GLOW_INNER, makeCardBackTexture, makeCentreTexture, makeFeltTexture, makeGlowTexture, makeTileTexture, SPACE_COLOURS,
} from './tile.textures';
import { TokenModel } from './TokenModels';

export interface TabletopSceneProps {
  players: Player[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  /** The space lifted out of the board: the landed or chosen space, or none while moving. */
  highlightTile: number | null;
  /** Where the active piece's current move ends, for the camera's framing. */
  destination: number | null;
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

const BOARD_THICKNESS = 0.24;
const TOKEN_SCALE = 0.86;
// Resting pieces turn a little towards the outside, so they show their profile.
const REST_TURN = 0.3;
// How far the highlighted space rises out of the board.
const LIFT = 0.16;
const GOLD = '#ffbd19';

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
  // How far each space is lifted this frame, so pieces can ride with it.
  const lifts = useRef(new Float32Array(TILE_COUNT));
  const active = props.players[props.currentPlayerIndex];
  // Which pieces share a space, so each can step aside for the others.
  const slots = useMemo(() => {
    const byTile = new Map<number, string[]>();
    props.players.filter((player) => !player.isBankrupt).forEach((player) => {
      byTile.set(player.position, [...(byTile.get(player.position) ?? []), player.id]);
    });
    return new Map([...byTile.values()].flatMap((ids) => ids.map((id, slot) => [id, { slot, count: ids.length }] as const)));
  }, [props.players]);
  const ownership = useMemo(() => new Map(props.properties.map((property) => [property.tileIndex, {
    colour: props.players.find((player) => player.id === property.ownerId)?.color ?? null,
    house: property.isLeveledUp,
  }])), [props.players, props.properties]);

  return (
    <>
      <TableLighting />
      <Table />
      <BoardBody />
      {props.tiles.map((tile) => (
        <BoardSpace
          key={tile.index}
          tile={tile}
          ownerColour={ownership.get(tile.index)?.colour ?? null}
          house={ownership.get(tile.index)?.house ?? false}
          raised={props.highlightTile === tile.index}
          reducedMotion={props.reducedMotion}
          lifts={lifts.current}
          onSelect={props.onTileSelect}
        />
      ))}
      <HighlightGlow index={props.highlightTile} lifts={lifts.current} />
      {props.stepTile && <StepFlash key={props.stepTile.id} index={props.stepTile.index} />}
      <CardDeck />

      <group position={[0, SURFACE_Y + 0.042, 0]}>
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
            lifts={lifts.current}
            reducedMotion={props.reducedMotion}
          />
        );
      })}

      <CameraRig
        mode={props.cameraMode}
        focusId={active?.id}
        restingIndex={active?.position ?? 0}
        destination={props.destination}
        insets={props.insets}
        reducedMotion={props.reducedMotion}
        motion={motion.current}
      />
      <SceneReady onReady={props.onReady} />
    </>
  );
}

/** Shared by the game table, the token lookbook and the token pictures. */
export function TableLighting({ backdrop = true }: { backdrop?: boolean }) {
  return (
    <>
      {backdrop && <color attach="background" args={['#103024']} />}
      {backdrop && <fog attach="fog" args={['#103024', 60, 150]} />}
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#fff7e6', '#1d4634', 0.75]} />
      <directionalLight
        castShadow
        position={[-7, 16, 9]}
        intensity={2.6}
        color="#fff4e0"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
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
    <mesh rotation-x={-Math.PI / 2} position={[0, SURFACE_Y - BOARD_THICKNESS - 0.005, 0]} receiveShadow>
      <planeGeometry args={[160, 160]} />
      <meshStandardMaterial map={felt} roughness={0.95} color="#ffffff" />
    </mesh>
  );
});

/**
 * Printed surfaces use unlit materials so they keep the exact colours of the
 * 2D board; shadows land on transparent catchers laid over them.
 */
function Print({ map, colour, width, depth, y = 0.002 }: { map?: MeshBasicMaterial['map']; colour?: string; width: number; depth: number; y?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={map ?? null} color={colour ?? '#ffffff'} toneMapped={false} />
    </mesh>
  );
}

function ShadowCatcher({ width, depth }: { width: number; depth: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <shadowMaterial transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

const BoardBody = memo(function BoardBody() {
  const centre = useMemo(() => makeCentreTexture(), []);
  useEffect(() => () => centre.dispose(), [centre]);
  const edge = BOARD_HALF * 2 + 0.3;
  const field = CENTRE_SIZE - TILE_GAP;
  return (
    <group position={[0, SURFACE_Y, 0]}>
      {/* A slim board; its dark top shows between the spaces as the printed rule lines. */}
      <RoundedBox args={[edge, BOARD_THICKNESS, edge]} radius={0.08} smoothness={4} position={[0, -BOARD_THICKNESS / 2, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#17201b" roughness={0.45} clearcoat={0.5} clearcoatRoughness={0.4} />
      </RoundedBox>
      <Print map={centre} width={field} depth={field} />
      <ShadowCatcher width={field} depth={field} />
    </group>
  );
});

let houseGeometry: { body: ExtrudeGeometry; roof: ExtrudeGeometry } | null = null;
function house() {
  if (houseGeometry) return houseGeometry;
  const body = new Shape();
  body.moveTo(-0.15, 0);
  body.lineTo(0.15, 0);
  body.lineTo(0.15, 0.18);
  body.lineTo(-0.15, 0.18);
  body.closePath();
  const roof = new Shape();
  roof.moveTo(-0.19, 0.17);
  roof.lineTo(0.19, 0.17);
  roof.lineTo(0, 0.32);
  roof.closePath();
  const options = { depth: 0.24, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 };
  houseGeometry = {
    body: new ExtrudeGeometry(body, options).translate(0, 0, -0.12),
    roof: new ExtrudeGeometry(roof, { ...options, depth: 0.28 }).translate(0, 0, -0.14),
  };
  return houseGeometry;
}
const HOUSE_MATERIAL = new MeshStandardMaterial({ color: '#1f9d55', roughness: 0.4, metalness: 0.05 });
const ROOF_MATERIAL = new MeshStandardMaterial({ color: '#17824a', roughness: 0.45 });

interface SpaceProps {
  tile: TileConfig;
  ownerColour: string | null;
  house: boolean;
  raised: boolean;
  reducedMotion: boolean;
  lifts: Float32Array;
  onSelect: (index: number) => void;
}

/**
 * One printed space. It sits flush with the board; when it is the landed or
 * chosen space it rises out of the board like a lifted card, with a gold edge,
 * carrying its owner strip, house and any pieces on it.
 */
const BoardSpace = memo(function BoardSpace({ tile, ownerColour, house: hasHouse, raised, reducedMotion, lifts, onSelect }: SpaceProps) {
  const place = tilePlacement(tile.index);
  const groupColour = tile.colorGroup ? COLOR_GROUP_PRESENTATION[tile.colorGroup] ?? null : null;
  const texture = useMemo(
    () => makeTileTexture(tile, place.corner, groupColour),
    // Prices and names are fixed for the match; ownership updates must not redraw faces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tile.index, tile.type, tile.name, tile.price, tile.colorGroup, tile.skillTheme, place.corner, groupColour],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const group = useRef<Group>(null);
  const lift = useRef({ value: 0, velocity: 0 });
  const invalidate = useThree((state) => state.invalidate);
  const width = place.width - TILE_GAP;
  const depth = place.depth - TILE_GAP;

  useEffect(() => { invalidate(); }, [raised, invalidate]);
  useFrame((_, delta) => {
    const goal = raised ? LIFT : 0;
    const state = lift.current;
    if (state.value === goal && state.velocity === 0) return;
    if (reducedMotion) {
      state.value = goal;
      state.velocity = 0;
    } else {
      [state.value, state.velocity] = springStep(state.value, state.velocity, goal, 11, Math.min(delta, 0.05));
      if (Math.abs(state.value - goal) < 0.0005 && Math.abs(state.velocity) < 0.005) {
        state.value = goal;
        state.velocity = 0;
      }
    }
    lifts[tile.index] = state.value;
    if (group.current) group.current.position.y = SURFACE_Y + state.value;
    invalidate();
  });

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(tile.index);
  };
  const setCursor = (cursor: string) => () => { document.body.style.cursor = cursor; };
  const geometry = house();
  const edge = 0.06;

  return (
    <group ref={group} position={[place.x, SURFACE_Y, place.z]} rotation-y={place.yaw}>
      {/* The card's edge, hidden inside the board until the space lifts. */}
      <mesh position={[0, -LIFT / 2 - 0.01, 0]} castShadow>
        <boxGeometry args={[width, LIFT + 0.02, depth]} />
        <meshStandardMaterial color={SPACE_COLOURS[tile.type] ?? SPACE_COLOURS.PROPERTY} roughness={0.8} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.002, 0]}
        onClick={select}
        onPointerOver={setCursor('pointer')}
        onPointerOut={setCursor('')}
      >
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {ownerColour && (
        <group position={[0, 0, depth / 2 - 0.13]}>
          <Print colour={ownerColour} width={width - 0.16} depth={0.14} y={0.003} />
        </group>
      )}
      <ShadowCatcher width={width} depth={depth} />
      {hasHouse && (
        <group position={[0, 0.003, -depth / 2 + BAND_DEPTH / 2]} rotation-y={Math.PI / 2}>
          <mesh geometry={geometry.body} material={HOUSE_MATERIAL} castShadow />
          <mesh geometry={geometry.roof} material={ROOF_MATERIAL} castShadow />
        </group>
      )}
      {raised && (
        <group position={[0, 0.006, 0]}>
          {[
            [0, -depth / 2 + edge / 2, width, edge], [0, depth / 2 - edge / 2, width, edge],
            [-width / 2 + edge / 2, 0, edge, depth], [width / 2 - edge / 2, 0, edge, depth],
          ].map(([x, z, w, d], i) => (
            <mesh key={i} position={[x, 0, z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[w, d]} />
              <meshBasicMaterial color={GOLD} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});

/** A warm glow on the board around the lifted space, fading in as it rises. */
function HighlightGlow({ index, lifts }: { index: number | null; lifts: Float32Array }) {
  const texture = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const material = useRef<MeshBasicMaterial>(null);
  const shown = useRef(index ?? 0);
  if (index !== null) shown.current = index;
  const place = tilePlacement(shown.current);
  useFrame(() => {
    if (!material.current) return;
    // Keeps glowing on the last space while it sinks back down.
    material.current.opacity = 0.75 * (lifts[shown.current] / LIFT);
  });
  return (
    <mesh position={[place.x, SURFACE_Y + 0.008, place.z]} rotation-x={-Math.PI / 2} rotation-z={place.yaw}>
      <planeGeometry args={[(place.width - TILE_GAP) / GLOW_INNER, (place.depth - TILE_GAP) / GLOW_INNER]} />
      <meshBasicMaterial ref={material} map={texture} color={GOLD} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Each visited space lights up briefly as the piece touches down. */
function StepFlash({ index }: { index: number }) {
  const place = tilePlacement(index);
  const material = useRef<MeshBasicMaterial>(null);
  const started = useRef(performance.now());
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    const t = (performance.now() - started.current) / 520;
    if (material.current) material.current.opacity = Math.max(0, 0.45 * (1 - t));
    if (t < 1) invalidate();
  });
  return (
    <mesh position={[place.x, SURFACE_Y + 0.01, place.z]} rotation-x={-Math.PI / 2} rotation-z={place.yaw}>
      <planeGeometry args={[place.width - TILE_GAP, place.depth - TILE_GAP]} />
      <meshBasicMaterial ref={material} color="#fff6d0" transparent opacity={0.45} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const CardDeck = memo(function CardDeck() {
  const face = useMemo(() => makeCardBackTexture(), []);
  useEffect(() => () => face.dispose(), [face]);
  return (
    <group position={[-2.55, SURFACE_Y, -2.75]} rotation-y={Math.PI / 4}>
      {Array.from({ length: 7 }, (_, i) => (
        <RoundedBox key={i} args={[1.05, 0.03, 1.4]} radius={0.012} smoothness={2} position={[(i % 2) * 0.012, 0.016 + i * 0.032, (i % 3) * 0.01]} rotation-y={(i % 3 - 1) * 0.02} castShadow receiveShadow>
          <meshStandardMaterial color="#f4f0ff" roughness={0.6} />
        </RoundedBox>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.016 + 7 * 0.032 + 0.001, 0]}>
        <planeGeometry args={[1.0, 1.35]} />
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
    </group>
  );
});

interface PieceState {
  index: number;
  fromIndex: number;
  from: Vector3;
  to: Vector3;
  live: Vector3;
  centreFrom: Vector3;
  centreTo: Vector3;
  centre: Vector3;
  start: number;
  duration: number;
  height: number;
  lastHop: number;
  yaw: number;
}

function centreOf(index: number): Vector3 {
  const tile = tilePlacement(index);
  return new Vector3(tile.x, 0, tile.z);
}

function TokenPiece({ player, slot, count, active, motion, lifts, reducedMotion }: {
  player: Player;
  slot: number;
  count: number;
  active: boolean;
  motion: Map<string, TokenMotion>;
  lifts: Float32Array;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [spotX, spotZ] = tokenSpot(player.position, slot, count);
  const piece = useRef<PieceState | null>(null);
  if (!piece.current) {
    const start = new Vector3(spotX, 0, spotZ);
    const centre = centreOf(player.position);
    piece.current = {
      index: player.position, fromIndex: player.position,
      from: start.clone(), to: start.clone(), live: start.clone(),
      centreFrom: centre.clone(), centreTo: centre.clone(), centre: centre.clone(),
      start: -1, duration: 0, height: 0, lastHop: -Infinity,
      yaw: travelYaw(centre.x, centre.z) + REST_TURN,
    };
  }

  useEffect(() => {
    const state = piece.current!;
    state.to.set(spotX, 0, spotZ);
    if (state.index !== player.position) {
      // Ordinary moves hop one space; card moves and jail transfers arc straight across.
      const walk = forwardSteps(state.index, player.position) === 1;
      state.from.copy(state.live);
      state.centreFrom.copy(state.centre);
      state.centreTo.copy(centreOf(player.position));
      state.fromIndex = state.index;
      state.duration = reducedMotion ? 0.12 : walk ? TOKEN_HOP_SECONDS : 0.55;
      state.height = reducedMotion ? 0.05 : walk ? 0.7 : 2.1;
      state.start = performance.now();
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
        state.centreFrom.copy(state.centre);
        state.fromIndex = state.index;
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
    let hop = 0;
    let squash = 1;
    let liftBlend = 1;
    if (state.start >= 0) {
      const t = Math.min(1, (now - state.start) / (state.duration * 1000));
      const eased = MathUtils.smoothstep(t, 0, 1);
      state.live.lerpVectors(state.from, state.to, eased);
      state.centre.lerpVectors(state.centreFrom, state.centreTo, eased);
      hop = Math.sin(Math.PI * t) * state.height;
      squash = 1 + 0.07 * Math.sin(Math.PI * t);
      liftBlend = eased;
      if (t >= 1) {
        state.start = -1;
        state.fromIndex = state.index;
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
    const targetYaw = travelYaw(state.centre.x, state.centre.z) + (travelling ? 0 : REST_TURN);
    state.yaw = MathUtils.lerp(state.yaw, targetYaw, 1 - Math.exp(-delta * (travelling ? 16 : 5)));
    if (Math.abs(state.yaw - targetYaw) > 1e-3) animating = true;
    else if (!travelling && now - state.lastHop < 700) animating = true;
    // Ride the lifted space, blending across a hop between spaces.
    const base = MathUtils.lerp(lifts[state.fromIndex] ?? 0, lifts[state.index] ?? 0, liftBlend);

    if (group.current) group.current.position.set(state.live.x, SURFACE_Y + base, state.live.z);
    if (body.current) {
      body.current.position.y = hop;
      body.current.rotation.y = state.yaw;
      body.current.scale.set(TOKEN_SCALE / Math.sqrt(squash), TOKEN_SCALE * squash, TOKEN_SCALE / Math.sqrt(squash));
    }
    if (ring.current) ring.current.scale.setScalar(active ? 1.08 : 1);
    motion.set(player.id, {
      x: state.live.x, z: state.live.z, cx: state.centre.x, cz: state.centre.z, index: state.index, moving: state.start >= 0,
    });
    if (animating) invalidate();
  });

  return (
    <group ref={group}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.014, 0]}>
        <torusGeometry args={[0.36, 0.032, 10, 40]} />
        <meshStandardMaterial color={player.color} emissive={player.color} emissiveIntensity={active ? 0.9 : 0.15} roughness={0.4} />
      </mesh>
      <group ref={body}>
        <TokenModel token={player.tokenType} />
      </group>
    </group>
  );
}
