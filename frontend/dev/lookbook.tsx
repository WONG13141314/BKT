// Development-only lookbook: the eight pieces under the game's own lighting.
// Run `npm run dev --workspace=frontend` and open /dev/lookbook.html.
import { Canvas } from '@react-three/fiber';
import { createRoot } from 'react-dom/client';
import { NeutralToneMapping } from 'three';
import { PLAYER_TOKENS } from '../src/features/game/types/game.types';
import { TableLighting } from '../src/features/game/components/tabletop/TabletopScene';
import { TokenModel } from '../src/features/game/components/tabletop/TokenModels';

const params = new URLSearchParams(location.search);
const yaw = Number(params.get('yaw') ?? 0.45);

function Lookbook() {
  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [0, 3.4, 9.5], fov: 34 }}
      gl={{ antialias: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1.05 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.35, 0)}
    >
      <TableLighting />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[30, 12]} />
        <meshStandardMaterial color="#fbf8ef" roughness={0.7} />
      </mesh>
      {PLAYER_TOKENS.map((token, index) => (
        <group key={token} position={[((index % 4) - 1.5) * 2.1, 0, index < 4 ? -1.1 : 1.1]} rotation-y={yaw} scale={0.86}>
          <TokenModel token={token} />
        </group>
      ))}
    </Canvas>
  );
}

createRoot(document.getElementById('root')!).render(<Lookbook />);
