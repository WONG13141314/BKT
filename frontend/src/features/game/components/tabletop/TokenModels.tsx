import type { ReactElement } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  MeshPhysicalMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { PlayerToken } from '../../types/game.types';

// Eight original pewter pieces in the classic Monopoly spirit. Each is modelled
// about one unit long, standing on y = 0 and facing +x; the scene scales them.
// Silhouette pieces are extruded side profiles with rounded bevels, so they read
// like cast metal rather than assembled blocks.

export const PEWTER = new MeshPhysicalMaterial({
  color: '#d6dade', metalness: 0.85, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 1.5,
});
const PEWTER_DARK = new MeshPhysicalMaterial({ color: '#8c939a', metalness: 0.85, roughness: 0.36, envMapIntensity: 1.3 });

type Point = [number, number];

function outline(points: Point[], curves: Record<number, Point> = {}): Shape {
  const shape = new Shape();
  shape.moveTo(...points[0]);
  points.slice(1).forEach((point, index) => {
    const control = curves[index + 1];
    if (control) shape.quadraticCurveTo(control[0], control[1], point[0], point[1]);
    else shape.lineTo(...point);
  });
  shape.closePath();
  return shape;
}

/** Extrude a side profile across its thickness, centred on z = 0. */
function slab(shape: Shape, thickness: number, bevel = 0.045): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 5,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -(thickness - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function tube(points: [number, number, number][], radius: number): TubeGeometry {
  return new TubeGeometry(new CatmullRomCurve3(points.map((point) => new Vector3(...point))), 24, radius, 10, false);
}

const cache = new Map<PlayerToken, BufferGeometry[]>();

function geometries(token: PlayerToken, build: () => BufferGeometry[]): BufferGeometry[] {
  let built = cache.get(token);
  if (!built) {
    built = build();
    cache.set(token, built);
  }
  return built;
}

function Part({ geometry, dark = false, position, rotation, scale }: {
  geometry: BufferGeometry;
  dark?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}) {
  return (
    <mesh geometry={geometry} material={dark ? PEWTER_DARK : PEWTER} position={position} rotation={rotation} scale={scale} castShadow receiveShadow />
  );
}

function ScottieDog() {
  const [body, eye, nose] = geometries('scottie_dog', () => [
    slab(outline([
      [-0.4, 0], [-0.24, 0], [-0.22, 0.12], [0.14, 0.12], [0.16, 0], [0.32, 0], [0.34, 0.15],
      [0.37, 0.2], [0.5, 0.21], [0.57, 0.3], [0.58, 0.39], [0.41, 0.45], [0.36, 0.51],
      [0.33, 0.69], [0.26, 0.53], [0.18, 0.51], [-0.3, 0.45], [-0.34, 0.58], [-0.4, 0.56],
      [-0.42, 0.42], [-0.44, 0.16],
    ], { 3: [-0.04, 0.09], 8: [0.44, 0.17], 9: [0.56, 0.22], 16: [-0.05, 0.5], 20: [-0.48, 0.3] }), 0.36, 0.065),
    new SphereGeometry(0.026, 12, 10),
    new SphereGeometry(0.04, 12, 10),
  ]);
  return (
    <group>
      <Part geometry={body} />
      <Part geometry={eye} dark position={[0.42, 0.45, 0.165]} />
      <Part geometry={eye} dark position={[0.42, 0.45, -0.165]} />
      <Part geometry={nose} dark position={[0.6, 0.39, 0]} />
    </group>
  );
}

function Boot() {
  const [boot, cuff, heel] = geometries('boot', () => [
    slab(outline([
      [-0.36, 0.05], [0.38, 0.05], [0.5, 0.13], [0.34, 0.24], [0.1, 0.3], [0.06, 0.64],
      [0.1, 0.72], [-0.31, 0.72], [-0.29, 0.6], [-0.31, 0.22],
    ], { 2: [0.52, 0.04], 4: [0.16, 0.28] }), 0.38, 0.07),
    new TorusGeometry(0.12, 0.035, 10, 32),
    slab(outline([[-0.37, 0], [-0.12, 0], [-0.12, 0.08], [-0.37, 0.08]]), 0.34, 0.02),
  ]);
  return (
    <group>
      <Part geometry={boot} />
      <Part geometry={heel} dark />
      <Part geometry={cuff} position={[-0.1, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.75, 1.6, 1]} />
    </group>
  );
}

function Cat() {
  const [body, tail, eye] = geometries('cat', () => [
    slab(outline([
      [-0.34, 0], [0.27, 0], [0.31, 0.07], [0.2, 0.1], [0.19, 0.36], [0.15, 0.46],
      [0.27, 0.5], [0.31, 0.58], [0.25, 0.68], [0.25, 0.84], [0.15, 0.73], [0.07, 0.86],
      [0.01, 0.69], [0.0, 0.56], [-0.36, 0.14],
    ], { 6: [0.31, 0.5], 8: [0.31, 0.66], 14: [-0.36, 0.42] }), 0.36, 0.065),
    tube([[-0.3, 0.06, 0.12], [-0.12, 0.04, 0.24], [0.1, 0.04, 0.22], [0.26, 0.05, 0.12]], 0.045),
    new SphereGeometry(0.024, 12, 10),
  ]);
  return (
    <group>
      <Part geometry={body} />
      <Part geometry={tail} />
      <Part geometry={eye} dark position={[0.24, 0.61, 0.165]} />
      <Part geometry={eye} dark position={[0.24, 0.61, -0.165]} />
    </group>
  );
}

function RaceCar() {
  const [body, wheel, hub, steering, exhaust] = geometries('race_car', () => [
    slab(outline([
      [-0.5, 0.13], [0.4, 0.13], [0.54, 0.2], [0.5, 0.28], [0.1, 0.32], [0.04, 0.4],
      [-0.1, 0.33], [-0.2, 0.47], [-0.3, 0.45], [-0.52, 0.27],
    ], { 2: [0.53, 0.13], 9: [-0.5, 0.42] }), 0.36, 0.07),
    new TorusGeometry(0.105, 0.05, 14, 32),
    new CylinderGeometry(0.075, 0.075, 0.07, 20),
    new TorusGeometry(0.07, 0.014, 8, 24),
    tube([[0.18, 0.18, 0.2], [-0.1, 0.17, 0.23], [-0.42, 0.16, 0.22]], 0.025),
  ]);
  return (
    <group>
      <Part geometry={body} />
      {[0.3, -0.33].flatMap((x) => [0.24, -0.24].map((z) => (
        <group key={`${x}${z}`} position={[x, 0.155, z * 1.12]}>
          <Part geometry={wheel} />
          <Part geometry={hub} dark rotation={[Math.PI / 2, 0, 0]} />
        </group>
      )))}
      <Part geometry={steering} dark position={[0.03, 0.43, 0]} rotation={[0, Math.PI / 2, 0.5]} />
      <Part geometry={exhaust} dark />
    </group>
  );
}

function Battleship() {
  const [hull, deck, bridge, turret, barrel, funnel, mast] = geometries('battleship', () => {
    const hullShape = slab(outline([
      [0.58, 0], [0.32, 0.17], [-0.42, 0.16], [-0.52, 0], [-0.42, -0.16], [0.32, -0.17],
    ], { 1: [0.5, 0.15], 4: [-0.54, -0.12] }), 0.17, 0.035);
    hullShape.rotateX(-Math.PI / 2);
    hullShape.translate(0, 0.085, 0);
    const deckShape = slab(outline([[0.18, 0.1], [-0.3, 0.1], [-0.3, -0.1], [0.18, -0.1]]), 0.1, 0.03);
    deckShape.rotateX(-Math.PI / 2);
    const bridgeShape = slab(outline([[0.06, 0], [0.02, 0.24], [-0.14, 0.24], [-0.16, 0]], { 1: [0.07, 0.2] }), 0.15, 0.03);
    return [
      hullShape,
      deckShape,
      bridgeShape,
      new SphereGeometry(0.08, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new CylinderGeometry(0.016, 0.02, 0.2, 10),
      new CylinderGeometry(0.05, 0.06, 0.2, 16),
      new CylinderGeometry(0.012, 0.016, 0.34, 8),
    ];
  });
  return (
    <group>
      <Part geometry={hull} />
      <Part geometry={deck} position={[0, 0.22, 0]} />
      <Part geometry={bridge} position={[0, 0.26, 0]} />
      {[0.34, -0.42].map((x) => (
        <group key={x} position={[x, 0.17, 0]} rotation={[0, x > 0 ? 0 : Math.PI, 0]}>
          <Part geometry={turret} />
          {[-0.03, 0.03].map((z) => <Part key={z} geometry={barrel} dark position={[0.12, 0.05, z]} rotation={[0, 0, Math.PI / 2 - 0.12]} />)}
        </group>
      ))}
      <Part geometry={funnel} position={[-0.2, 0.36, 0]} rotation={[0, 0, 0.18]} />
      <Part geometry={mast} dark position={[-0.04, 0.6, 0]} />
    </group>
  );
}

function TopHat() {
  const [hat, band] = geometries('top_hat', () => [
    new LatheGeometry([
      [0, 0], [0.38, 0], [0.43, 0.025], [0.45, 0.07], [0.42, 0.085], [0.27, 0.07], [0.255, 0.1],
      [0.245, 0.42], [0.262, 0.66], [0.27, 0.7], [0.25, 0.72], [0, 0.72],
    ].map(([x, y]) => new Vector2(x, y)), 56),
    new TorusGeometry(0.252, 0.03, 10, 56),
  ]);
  return (
    <group scale={[1, 1, 0.86]}>
      <Part geometry={hat} />
      <Part geometry={band} dark position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function RubberDuck() {
  const [sphere, beak, tail, eye] = geometries('rubber_duck', () => [
    new SphereGeometry(1, 36, 24),
    new SphereGeometry(1, 24, 14),
    new ExtrudeGeometry(outline([[0, 0], [0.12, 0], [-0.04, 0.16]], { 2: [0.12, 0.1] }), {
      depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4,
    }),
    new SphereGeometry(0.028, 12, 10),
  ]);
  return (
    <group>
      <Part geometry={sphere} position={[-0.04, 0.22, 0]} scale={[0.4, 0.23, 0.3]} />
      <Part geometry={sphere} position={[0.19, 0.53, 0]} scale={[0.17, 0.17, 0.16]} />
      <Part geometry={sphere} position={[-0.08, 0.3, 0.2]} scale={[0.2, 0.09, 0.08]} rotation={[0, 0.2, -0.25]} />
      <Part geometry={sphere} position={[-0.08, 0.3, -0.2]} scale={[0.2, 0.09, 0.08]} rotation={[0, -0.2, -0.25]} />
      <Part geometry={beak} position={[0.36, 0.5, 0]} scale={[0.13, 0.045, 0.1]} />
      <Part geometry={tail} position={[-0.42, 0.26, -0.07]} />
      <Part geometry={eye} dark position={[0.3, 0.58, 0.09]} />
      <Part geometry={eye} dark position={[0.3, 0.58, -0.09]} />
    </group>
  );
}

function Wheelbarrow() {
  const [tray, floor, wheel, hub, handle, leg] = geometries('wheelbarrow', () => {
    const outer = new Shape();
    outer.moveTo(-0.32, -0.22);
    outer.lineTo(0.26, -0.18);
    outer.quadraticCurveTo(0.36, 0, 0.26, 0.18);
    outer.lineTo(-0.32, 0.22);
    outer.closePath();
    const inner = new Shape();
    inner.moveTo(-0.27, -0.17);
    inner.lineTo(0.22, -0.135);
    inner.quadraticCurveTo(0.3, 0, 0.22, 0.135);
    inner.lineTo(-0.27, 0.17);
    inner.closePath();
    outer.holes.push(inner);
    const walls = new ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, curveSegments: 12 });
    walls.rotateX(-Math.PI / 2);
    const base = slab(outline([[-0.3, -0.2], [0.24, -0.16], [0.24, 0.16], [-0.3, 0.2]]), 0.04, 0.015);
    base.rotateX(-Math.PI / 2);
    return [
      walls,
      base,
      new TorusGeometry(0.12, 0.04, 12, 32),
      new CylinderGeometry(0.05, 0.05, 0.1, 16),
      tube([[0.3, 0.14, 0], [0.1, 0.24, 0], [-0.3, 0.26, 0], [-0.62, 0.32, 0]], 0.022),
      tube([[-0.24, 0.26, 0], [-0.26, 0.12, 0], [-0.28, 0, 0]], 0.02),
    ];
  });
  return (
    <group>
      <Part geometry={tray} position={[0, 0.28, 0]} />
      <Part geometry={floor} position={[0, 0.27, 0]} />
      <Part geometry={wheel} position={[0.36, 0.16, 0]} />
      <Part geometry={hub} dark position={[0.36, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {[0.15, -0.15].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <Part geometry={handle} />
          <Part geometry={leg} />
        </group>
      ))}
    </group>
  );
}

const MODELS: Record<PlayerToken, () => ReactElement> = {
  race_car: RaceCar,
  top_hat: TopHat,
  battleship: Battleship,
  boot: Boot,
  scottie_dog: ScottieDog,
  cat: Cat,
  rubber_duck: RubberDuck,
  wheelbarrow: Wheelbarrow,
};

export function TokenModel({ token }: { token: PlayerToken | undefined }) {
  const Model = (token && MODELS[token]) || RaceCar;
  return <Model />;
}
