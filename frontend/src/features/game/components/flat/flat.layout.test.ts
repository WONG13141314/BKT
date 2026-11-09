import { describe, expect, it } from 'vitest';
import { BOARD_EDGE, TILE_GAP, tilePlacement } from '../tabletop/board.layout';
import { hudInsets } from '../tabletop/useViewportPreferences';
import { flatFrame, landingCard } from './flat.layout';

const screens = [
  { name: 'laptop', width: 1280, height: 760 },
  { name: 'laptop 1366', width: 1366, height: 768 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
];

describe('flat board layout', () => {
  it('fills the space beside the panels, larger than the 3D camera framing', () => {
    for (const { width, height } of screens) {
      const frame = flatFrame(width, height);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.left + frame.size).toBeLessThanOrEqual(width);
      expect(frame.top + frame.size).toBeLessThanOrEqual(height);
      expect(frame.unit).toBeCloseTo(frame.size / BOARD_EDGE);
      const insets = hudInsets(width, height);
      const framed = Math.min(width - insets.left - insets.right, height - insets.top - insets.bottom);
      expect(frame.size).toBeGreaterThanOrEqual(framed * 0.97);
    }
  });

  it('keeps clear of the turn banner and the players panel on a laptop', () => {
    const frame = flatFrame(1280, 760);
    // Measured: the banner ends at y 70, the players panel at x 276, the deed starts at x 964.
    expect(frame.top).toBeGreaterThan(70);
    expect(frame.left).toBeGreaterThan(276);
    expect(frame.left + frame.size).toBeLessThan(964);
    expect(frame.size).toBeGreaterThan(660);
  });

  it('brings a landed space up large where the 3D camera frames a landing', () => {
    for (const { width, height } of screens) {
      const frame = flatFrame(width, height);
      const card = landingCard(frame, width, height, 3);
      const insets = hudInsets(width, height);
      const centreX = insets.left + (width - insets.left - insets.right) / 2;
      const centreY = insets.top + (height - insets.top - insets.bottom) / 2;
      expect(card.open).toBe(`translate(${centreX}px, ${centreY}px)`);
      expect(card.unit).toBeGreaterThanOrEqual(frame.unit);
    }
    const laptop = flatFrame(1280, 760);
    expect(landingCard(laptop, 1280, 760, 3).unit / laptop.unit).toBeGreaterThan(1.8);
  });

  it('shows the close-up upright, at the size of the space it stands for', () => {
    const frame = flatFrame(1280, 760);
    const card = landingCard(frame, 1280, 760, 7);
    const place = tilePlacement(7);
    expect(card.width / card.height).toBeCloseTo((place.width - TILE_GAP) / (place.depth - TILE_GAP));
    // It grows slightly into place where it is shown, without travelling.
    expect(card.closed).toBe(card.open + ' scale(0.9)');
  });
});
