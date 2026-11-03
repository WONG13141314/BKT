import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, Suspense, useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending, ExtrudeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NeutralToneMapping, PerspectiveCamera, Quaternion, Shape, Vector3,
} from 'three';
import type { Player, PropertyState, TileConfig } from '../../types/game.types';
import { COLOR_GROUP_PRESENTATION } from '../../config/board.presentation';
import { SceneReady } from '../BoardRendering';
import { PhysicsDiceContent } from '../PhysicsDice';
import { TOKEN_HOP_SECONDS } from '../board.animation';
import {
  BAND_DEPTH, BOARD_HALF, CENTRE_SIZE, DECK_SPOT, forwardSteps, nearestAngle, pieceFacing, SURFACE_Y, TILE_COUNT, TILE_GAP,
  tilePlacement, tokenSpot,
} from './board.layout';
import { CameraRig, type TokenMotion } from './CameraRig';
import { springStep, type CameraMode, type SafeInsets } from './camera';
import {
  GLOW_INNER, makeCardBackTexture, makeCardFaceTexture, makeCentreTexture, makeFeltTexture, makeGlowTexture, makeTileTexture, SPACE_COLOURS,
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
  /** A Challenge Card being drawn from the deck, or null. */
  cardDraw: TableCardDraw | null;
}

export interface TableCardDraw {
  /** Changes for each new draw. */
  id: string;
  card: { name: string; description: string; isMathCard: boolean };
  /** `ready`: the top card waits to be picked; `drawing`: it lifts, turns and rises; `shown`: it has left the table. */
  stage: 'ready' | 'drawing' | 'shown';
  /** Present when this viewer may pick the card. */
  onPick?: () => void;
  /** The card has risen to the camera; where it is on screen, in CSS pixels. */
  onDrawn: (point: { x: number; y: number } | null) => void;
}

const BOARD_THICKNESS = 0.24;
// Sizes in proportion to a side space (2 wide): a piece about 0.6 long, so four
// fit on one space with room between them, and a die about a third of a space,
// as on a printed board.
const TOKEN_SCALE = 0.56;
export const DICE_SCALE = 0.6;
const RING_RADIUS = 0.27;

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
      <CardDeck draw={props.cardDraw} />

      {/* The physics floor sits 0.04 below the tray origin, scaled with the dice. */}
      <group position={[0, SURFACE_Y + 0.04 * DICE_SCALE + 0.002, 0]}>
        <PhysicsDiceContent
          visualScale={DICE_SCALE}
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

const CARD_SIZE = { width: 1.0, depth: 1.35 };
const DECK_COUNT = 7;
const DECK_TOP = 0.016 + DECK_COUNT * 0.032;
// Seconds for each part of the draw: off the deck, over, then up to the camera.
const DRAW_TIMES = { lift: 0.35, flip: 0.5, present: 0.6 };
/** How much of the screen's height the presented card fills, and how far above centre it sits. */
const PRESENT = { height: 0.5, width: 0.8, raise: 0.01 };
const WORLD_UP = new Vector3(0, 1, 0);

/** The Challenge Card deck in the centre. Its top card is the one that gets drawn. */
const CardDeck = memo(function CardDeck({ draw }: { draw: TableCardDraw | null }) {
  const face = useMemo(() => makeCardBackTexture(), []);
  useEffect(() => () => face.dispose(), [face]);
  const pick = draw?.stage === 'ready' ? draw.onPick : undefined;
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (!pick) return;
    event.stopPropagation();
    pick();
  };
  const setCursor = (cursor: string) => () => { document.body.style.cursor = pick ? cursor : ''; };
  return (
    <group position={[DECK_SPOT.x, SURFACE_Y, DECK_SPOT.z]} rotation-y={DECK_SPOT.yaw} scale={0.78}>
      <group onClick={select} onPointerOver={setCursor('pointer')} onPointerOut={setCursor('')}>
        {Array.from({ length: DECK_COUNT }, (_, i) => (
          <RoundedBox key={i} args={[CARD_SIZE.width + 0.05, 0.03, CARD_SIZE.depth + 0.05]} radius={0.012} smoothness={2} position={[(i % 2) * 0.012, 0.016 + i * 0.032, (i % 3) * 0.01]} rotation-y={(i % 3 - 1) * 0.02} castShadow receiveShadow>
            <meshStandardMaterial color="#f4f0ff" roughness={0.6} />
          </RoundedBox>
        ))}
        <mesh rotation-x={-Math.PI / 2} position={[0, DECK_TOP + 0.001, 0]}>
          <planeGeometry args={[CARD_SIZE.width, CARD_SIZE.depth]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
      </group>
      {draw && <DrawnCard key={draw.id} draw={draw} back={face} />}
    </group>
  );
});

/**
 * The top card coming off the deck. Waiting, it bobs to be picked; drawn, it
 * lifts, turns face up and comes to rest square to the camera, large enough to
 * read: the card on the table is the card the player reads.
 */
function DrawnCard({ draw, back }: { draw: TableCardDraw; back: MeshBasicMaterial['map'] }) {
  const faceTexture = useMemo(() => makeCardFaceTexture(draw.card), [draw.card]);
  useEffect(() => () => faceTexture.dispose(), [faceTexture]);
  const holder = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const started = useRef<number | null>(null);
  const reported = useRef(false);
  const onDrawn = useRef(draw.onDrawn);
  onDrawn.current = draw.onDrawn;
  const scratch = useMemo(() => ({
    camera: new Vector3(), lifted: new Vector3(), target: new Vector3(), offset: new Vector3(), screen: new Vector3(),
    liftedTurn: new Quaternion(), targetTurn: new Quaternion(), parentTurn: new Quaternion(),
    faceCamera: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
  }), []);

  useEffect(() => {
    if (draw.stage !== 'ready' && started.current === null) started.current = performance.now();
    invalidate();
  }, [draw.stage, invalidate]);

  useFrame(() => {
    const group = holder.current;
    const parent = group?.parent;
    if (!group || !parent || !flip.current) return;
    const now = performance.now();
    // Turn the card so its foot faces the camera, in the deck's own frame.
    parent.worldToLocal(scratch.camera.copy(camera.position));
    const yaw = Math.atan2(scratch.camera.x, scratch.camera.z);

    if (started.current === null) {
      // Waiting to be picked: a gentle bob says "this one".
      group.position.set(0, DECK_TOP + 0.03 + Math.sin(now / 260) * 0.03, 0);
      group.quaternion.identity();
      flip.current.rotation.set(0, 0, 0);
      invalidate();
      return;
    }

    const t = (now - started.current) / 1000;
    const lift = MathUtils.smoothstep(t, 0, DRAW_TIMES.lift);
    const over = MathUtils.smoothstep(t, DRAW_TIMES.lift * 0.6, DRAW_TIMES.lift + DRAW_TIMES.flip);
    const presentStart = DRAW_TIMES.lift + DRAW_TIMES.flip;
    const present = MathUtils.smoothstep(t, presentStart, presentStart + DRAW_TIMES.present);

    // Off the deck and turned towards the camera.
    scratch.lifted.set(0, DECK_TOP + 0.03 + lift * 1.3, 0);
    scratch.liftedTurn.setFromAxisAngle(WORLD_UP, MathUtils.lerp(0, yaw, lift));

    // Where it comes to rest: straight in front of the camera, square to it,
    // at the distance that gives it a set share of the screen.
    const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const worldScale = parent.getWorldScale(scratch.offset).x;
    const cardHeight = CARD_SIZE.depth * worldScale;
    const cardWidth = CARD_SIZE.width * worldScale;
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(
      cardHeight / (PRESENT.height * 2 * tanHalf),
      cardWidth / (PRESENT.width * 2 * tanHalf * aspect),
    );
    scratch.target.set(0, PRESENT.raise * 2 * tanHalf * distance, -distance)
      .applyQuaternion(camera.quaternion).add(camera.position);
    parent.worldToLocal(scratch.target);
    parent.getWorldQuaternion(scratch.parentTurn);
    scratch.targetTurn.copy(camera.quaternion).multiply(scratch.faceCamera).premultiply(scratch.parentTurn.invert());

    group.position.lerpVectors(scratch.lifted, scratch.target, present);
    group.quaternion.slerpQuaternions(scratch.liftedTurn, scratch.targetTurn, present);
    flip.current.rotation.set(over * Math.PI, 0, 0);

    if (present >= 1 && !reported.current) {
      reported.current = true;
      group.getWorldPosition(scratch.screen).project(camera);
      onDrawn.current({ x: (scratch.screen.x + 1) / 2 * size.width, y: (1 - scratch.screen.y) / 2 * size.height });
    }
    // Once at rest it follows the camera on the frames the camera itself requests.
    if (present < 1) invalidate();
  });

  return (
    <group ref={holder}>
      <group ref={flip}>
        <mesh>
          <boxGeometry args={[CARD_SIZE.width, 0.012, CARD_SIZE.depth]} />
          <meshStandardMaterial color="#f4f0ff" roughness={0.6} />
        </mesh>
        {/* Back on top while it lies on the deck; the face underneath turns up. */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, 0]}>
          <planeGeometry args={[CARD_SIZE.width, CARD_SIZE.depth]} />
          <meshBasicMaterial map={back} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2} position={[0, -0.007, 0]}>
          <planeGeometry args={[CARD_SIZE.width, CARD_SIZE.depth]} />
          <meshBasicMaterial map={faceTexture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

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
      yaw: pieceFacing(player.position),
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
      state.height = reducedMotion ? 0.04 : walk ? 0.45 : 1.6;
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
        state.height = 0.25;
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
    // Turn only when the facing changes (at a corner), the short way round.
    const targetYaw = nearestAngle(pieceFacing(state.index), state.yaw);
    state.yaw = MathUtils.lerp(state.yaw, targetYaw, 1 - Math.exp(-delta * 14));
    if (Math.abs(state.yaw - targetYaw) > 1e-3) animating = true;
    else state.yaw = targetYaw;
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
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <torusGeometry args={[RING_RADIUS, 0.022, 10, 40]} />
        <meshStandardMaterial color={player.color} emissive={player.color} emissiveIntensity={active ? 0.9 : 0.15} roughness={0.4} />
      </mesh>
      <group ref={body}>
        <TokenModel token={player.tokenType} />
      </group>
    </group>
  );
}
