// Renders each pewter piece alone on a transparent background and exposes the
// pictures as data URLs for scripts/render-token-icons.mjs to save.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NeutralToneMapping } from 'three';
import { PLAYER_TOKENS } from '../src/features/game/types/game.types';
import { TableLighting } from '../src/features/game/components/tabletop/TabletopScene';
import { TokenModel } from '../src/features/game/components/tabletop/TokenModels';

declare global {
  interface Window { __icons?: Record<string, string>; __iconsDone?: boolean }
}

const PROFILE = new Set(['scottie_dog', 'cat', 'boot', 'race_car']);

function Capture({ index, onDone }: { index: number; onDone: () => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  useFrame(() => {
    // Let the environment reflections and shadows settle before capturing.
    if (++frames.current < 8) return;
    frames.current = -1000;
    window.__icons = { ...window.__icons, [PLAYER_TOKENS[index]]: gl.domElement.toDataURL('image/png') };
    onDone();
  });
  return null;
}

function Pictures() {
  const [index, setIndex] = useState(0);
  const token = PLAYER_TOKENS[index];
  return (
    <Canvas
      shadows="percentage"
      frameloop="always"
      dpr={1}
      camera={{ position: [0, 1.05, 2.7], fov: 30 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1.1 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.33, 0)}
    >
      <TableLighting backdrop={false} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <shadowMaterial transparent opacity={0.3} />
      </mesh>
      {/* Silhouette pieces read best close to profile; round ones in three-quarter view. */}
      <group key={token} rotation-y={PROFILE.has(token) ? -0.22 : -0.55} position={[0.02, 0, 0]}>
        <TokenModel token={token} />
      </group>
      <Capture
        key={`capture-${token}`}
        index={index}
        onDone={() => {
          if (index + 1 < PLAYER_TOKENS.length) setIndex(index + 1);
          else window.__iconsDone = true;
        }}
      />
    </Canvas>
  );
}

createRoot(document.getElementById('root')!).render(<Pictures />);
