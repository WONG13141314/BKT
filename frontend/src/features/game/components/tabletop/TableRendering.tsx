import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Material, Object3D, Texture } from 'three';

/** Where each shadow-casting object was at the last shadow redraw. */
export function shadowCasterSignature(scene: Object3D, out: number[]): number[] {
  out.length = 0;
  scene.traverseVisible((object) => {
    if (!object.castShadow || !(object as { isMesh?: boolean }).isMesh) return;
    out.push(object.id);
    const elements = object.matrixWorld.elements;
    for (let i = 0; i < 16; i++) out.push(elements[i]);
  });
  return out;
}

function sameSignature(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Redraws the shadows only on frames where something that casts one has
 * moved, appeared or gone: a piece, the dice, a lifting space, a card. When
 * only the camera moves the shadows are unchanged, so the last ones are kept.
 * The check runs after the scene's positions are final and before the shadows
 * would be drawn, so the picture is the same as redrawing every frame.
 */
export function ShadowSync() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    let previous: number[] = [];
    let current: number[] = [];
    const shadowMap = gl.shadowMap;
    const before = scene.onBeforeRender;
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    scene.onBeforeRender = (...args) => {
      before.apply(scene, args);
      shadowCasterSignature(scene, current);
      if (!sameSignature(current, previous)) {
        shadowMap.needsUpdate = true;
        [previous, current] = [current, previous];
      }
    };
    return () => {
      scene.onBeforeRender = before;
      shadowMap.autoUpdate = true;
    };
  }, [gl, scene]);

  return null;
}

/** The textures a scene's materials draw with, for uploading ahead of time. */
function sceneTextures(scene: Object3D): Texture[] {
  const found = new Set<Texture>();
  scene.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    for (const item of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(item as unknown as Record<string, unknown>)) {
        if ((value as Texture | null)?.isTexture) found.add(value as Texture);
      }
      const uniforms = (item as { uniforms?: Record<string, { value: unknown }> }).uniforms;
      for (const uniform of Object.values(uniforms ?? {})) {
        if ((uniform.value as Texture | null)?.isTexture) found.add(uniform.value as Texture);
      }
    }
  });
  return [...found];
}

/** If the browser never reports its shaders ready, draw anyway after this long. */
const PREPARE_LIMIT_MS = 3000;

/**
 * Draws the table. Before the first frame it compiles every shader in the
 * background and uploads the textures one per frame, so opening the game never
 * freezes the page; the table is still hidden then, behind the opening screen.
 * After that it draws every frame the scene asks for, at the screen's own rate.
 */
export function TableRenderer({ onReady }: { onReady?: () => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const stage = useRef<'compiling' | 'uploading' | 'drawing'>('compiling');
  const uploads = useRef<Texture[]>([]);
  const reported = useRef(false);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  useEffect(() => {
    // Preparation happens once; a later re-run must never pause drawing.
    if (stage.current !== 'compiling') return;
    let done = false;
    const startUploads = () => {
      if (done) return;
      done = true;
      uploads.current = sceneTextures(scene);
      stage.current = 'uploading';
      invalidate();
    };
    const limit = setTimeout(startUploads, PREPARE_LIMIT_MS);
    gl.compileAsync(scene, camera).then(startUploads, startUploads);
    return () => {
      done = true;
      clearTimeout(limit);
    };
  }, [gl, scene, camera, invalidate]);

  useFrame((state) => {
    if (stage.current === 'compiling') return;
    if (stage.current === 'uploading') {
      const texture = uploads.current.shift();
      if (texture) state.gl.initTexture(texture);
      if (uploads.current.length === 0) stage.current = 'drawing';
      invalidate();
      return;
    }

    state.gl.render(state.scene, state.camera);
    if (!reported.current) {
      reported.current = true;
      requestAnimationFrame(() => readyCallback.current?.());
    }
  }, 1);

  return null;
}
