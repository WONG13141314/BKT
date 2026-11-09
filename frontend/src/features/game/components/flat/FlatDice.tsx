import { Canvas } from '@react-three/fiber';
import type { BoardDice } from '../board.types';
import { DICE_FLOOR_Y, TableDice } from '../TableDice';

/**
 * The flat board's dice: the same 3D dice and recorded throws as the 3D table,
 * in a small view of their own over the centre of the board, lit and framed
 * as in the earlier 2D game. Only the dice are drawn in 3D, so this stays
 * quick even where the browser draws 3D without the graphics chip.
 */
export function FlatDice({ dice }: { dice: BoardDice }) {
  return (
    <Canvas
      shadows="percentage"
      frameloop="demand"
      dpr={[1, 1.5]}
      style={{ pointerEvents: 'none' }}
      camera={{ position: [0, 6.2, 7.7], fov: 29, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}
    >
      <ambientLight intensity={1.12} />
      <directionalLight castShadow position={[-4, 8, 5]} intensity={2.45} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[4, 4, 4]} intensity={18} distance={12} color="#fff3d3" />
      <mesh receiveShadow position={[0, DICE_FLOOR_Y + 0.005, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[7, 4.3]} />
        <shadowMaterial transparent opacity={0.08} />
      </mesh>
      <TableDice
        values={dice.values}
        rollId={dice.rollId}
        animate={dice.animate}
        onRollingChange={dice.onRollingChange}
        onReady={dice.onReady}
      />
    </Canvas>
  );
}
