import { describe, expect, it } from 'vitest';
import boardStyles from './Board.css?raw';
import boardPiecesSource from './BoardPiecesScene.tsx?raw';

describe('Board rendering safeguards', () => {
  it('paints the landed-space border above property colour strips', () => {
    const selectedFrame = boardStyles.match(/\.board-tile\.selected-tile::after\s*\{[^}]+\}/s)?.[0] ?? '';

    expect(selectedFrame).toContain("content: ''");
    expect(selectedFrame).toContain('inset: 0');
    expect(selectedFrame).toContain('border: 3px solid #e63946');
    expect(selectedFrame).toContain('z-index: 20');
    expect(selectedFrame).toContain('pointer-events: none');
  });

  it('retains idle token frames instead of continuously repainting them', () => {
    expect(boardPiecesSource).toContain('frameloop="demand"');
    expect(boardPiecesSource).toContain('preserveDrawingBuffer: true');
    expect(boardPiecesSource).toContain('if (progress.current < 1) invalidate()');
  });
});
