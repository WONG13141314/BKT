import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import {
  drawCardBack, drawCardFace, drawCentre, drawFelt, drawGlow, drawTileAtlas, type AtlasRect, type TileFace,
} from './board.art';

export { GLOW_INNER, SPACE_COLOURS } from './board.art';

// The board's artwork (board.art.ts) as textures for the 3D table.

function finish(element: HTMLCanvasElement) {
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  // The renderer clamps this to what the device supports; crisp print at low angles.
  texture.anisotropy = 16;
  return texture;
}

export interface TileAtlas {
  texture: CanvasTexture;
  rects: Map<number, AtlasRect>;
}

/** Every space's face on one texture, so the board prints in a single draw. */
export function makeTileAtlas(faces: TileFace[]): TileAtlas {
  const { image, rects } = drawTileAtlas(faces);
  return { texture: finish(image), rects };
}

export const makeCentreTexture = () => finish(drawCentre());
export const makeCardBackTexture = () => finish(drawCardBack());
export const makeCardFaceTexture = (card: Parameters<typeof drawCardFace>[0]) => finish(drawCardFace(card));
export const makeGlowTexture = () => finish(drawGlow());

export function makeFeltTexture(): CanvasTexture {
  const texture = finish(drawFelt());
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(24, 24);
  return texture;
}
