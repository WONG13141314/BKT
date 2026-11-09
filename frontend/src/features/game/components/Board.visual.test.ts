import { describe, expect, it } from 'vitest';
import flatStyles from './flat/FlatBoard.css?raw';
import tabletopSource from './tabletop/TabletopScene.tsx?raw';
import cameraSource from './tabletop/CameraRig.tsx?raw';

describe('Board rendering safeguards', () => {
  it('lifts the chosen space on the flat board with the gold edge of the 3D board', () => {
    const lift = flatStyles.match(/\.flat-lift\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(lift).toContain('border: calc(var(--u) * .06) solid #ffbd19');
    expect(lift).toContain('pointer-events: none');
  });

  it('retains idle table frames instead of continuously repainting them', () => {
    expect(tabletopSource).toContain('frameloop="demand"');
    expect(tabletopSource).toContain('if (animating) invalidate()');
    expect(cameraSource).toContain('if (moving || focus?.moving) invalidate()');
  });
});
