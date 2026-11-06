import { Color, ShaderMaterial, UniformsLib, UniformsUtils, type Texture } from 'three';

/** How dark a shadow lands on the printed board (the old shadow catchers' opacity). */
export const PRINT_SHADOW_OPACITY = 0.28;

const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
#ifdef USE_LIFT
attribute float tile;
uniform float lifts[ TILE_COUNT ];
#endif
uniform float shadowRise;
varying vec2 vPrintUv;

void main() {
  vPrintUv = uv;
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #ifdef USE_LIFT
  // A lifted space rises out of the board with everything printed on it.
  transformed.y += lifts[ int( tile + 0.5 ) ];
  #endif
  #include <project_vertex>
  #include <worldpos_vertex>
  #ifdef USE_SHADOWMAP
  // Shadows are read where the old catcher sheet lay, just above the print.
  worldPosition.y += shadowRise;
  #endif
  #include <shadowmap_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */`
#ifdef USE_PRINT_MAP
uniform sampler2D map;
#else
uniform vec3 colour;
#endif
uniform float shadowOpacity;
varying vec2 vPrintUv;

#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

void main() {
  #ifdef USE_PRINT_MAP
  gl_FragColor = vec4( texture2D( map, vPrintUv ).rgb, 1.0 );
  #else
  gl_FragColor = vec4( colour, 1.0 );
  #endif
  #include <colorspace_fragment>
  #include <fog_fragment>
  // The same darkening a transparent shadow sheet laid over the print gave.
  gl_FragColor.rgb *= 1.0 - shadowOpacity * ( 1.0 - getShadowMask() );
}
`;

interface PrintOptions {
  map?: Texture;
  colour?: string;
  /** Per-space lift heights, read by a merged sheet whose vertices carry a `tile` index. */
  lifts?: Float32Array;
  /** Height above the print at which shadows are read. */
  shadowRise?: number;
}

/**
 * An unlit print (the exact colours of the 2D board) that also shows the
 * table's shadows, in one draw. It replaces an unlit print plus a transparent
 * shadow sheet over it, so each board pixel is painted once instead of twice.
 * The mesh using it must have `receiveShadow` set.
 */
export function makePrintMaterial({ map, colour = '#ffffff', lifts, shadowRise = 0.003 }: PrintOptions): ShaderMaterial {
  const uniforms = UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog]);
  uniforms.shadowOpacity = { value: PRINT_SHADOW_OPACITY };
  uniforms.shadowRise = { value: shadowRise };
  if (map) uniforms.map = { value: map };
  else uniforms.colour = { value: new Color(colour) };
  if (lifts) uniforms.lifts = { value: lifts };
  const defines: Record<string, string | number> = {};
  if (map) defines.USE_PRINT_MAP = '';
  if (lifts) {
    defines.USE_LIFT = '';
    defines.TILE_COUNT = lifts.length;
  }
  return new ShaderMaterial({
    uniforms,
    defines,
    vertexShader,
    fragmentShader,
    lights: true,
    fog: true,
    toneMapped: false,
  });
}
