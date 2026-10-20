import { describe, expect, it } from 'vitest';
import { getGridPosition } from '../../config/board.presentation';
import { forwardSteps, nearestSide, sideProgress, TILE_COUNT, tilePlacement, tokenSpot, travelYaw } from './board.layout';
import { cameraPosition, cornerness, followGoal, overviewGoal, type CameraViewport } from './camera';

const desktop: CameraViewport = { width: 1440, height: 900, fov: 38, insets: { top: 84, right: 340, bottom: 104, left: 276 } };
const phone: CameraViewport = { width: 375, height: 812, fov: 38, insets: { top: 150, right: 8, bottom: 170, left: 8 } };

describe('3D board layout', () => {
  it('places every space where the 2D board draws it', () => {
    for (let index = 0; index < TILE_COUNT; index++) {
      const { gridRow, gridColumn } = getGridPosition(index);
      const { x, z } = tilePlacement(index);
      // Columns run left to right and rows top to bottom on both boards.
      for (let other = 0; other < TILE_COUNT; other++) {
        const second = getGridPosition(other);
        const place = tilePlacement(other);
        expect(Math.sign(place.x - x)).toBe(Math.sign(second.gridColumn - gridColumn));
        expect(Math.sign(place.z - z)).toBe(Math.sign(second.gridRow - gridRow));
      }
    }
  });

  it('turns smoothly through every corner, including past Mula', () => {
    for (let track = 0; track < 45; track += 0.05) {
      expect(Math.abs(sideProgress(track + 0.05) - sideProgress(track))).toBeLessThan(0.1);
    }
    expect(sideProgress(2.5)).toBe(0);
    expect(sideProgress(7.5)).toBe(1);
    expect(sideProgress(22.5)).toBe(4);
  });

  it('keeps every waiting piece on its own space', () => {
    for (let index = 0; index < TILE_COUNT; index++) {
      const tile = tilePlacement(index);
      for (let count = 1; count <= 4; count++) {
        for (let slot = 0; slot < count; slot++) {
          const [x, z] = tokenSpot(index, slot, count);
          expect(Math.abs(x - tile.x)).toBeLessThan(Math.max(tile.width, tile.depth) / 2 - 0.3);
          expect(Math.abs(z - tile.z)).toBeLessThan(Math.max(tile.width, tile.depth) / 2 - 0.3);
        }
      }
    }
  });

  it('faces pieces along the route and counts forward spaces with wrapping', () => {
    expect(Math.cos(travelYaw(0))).toBeCloseTo(-1);
    expect(forwardSteps(18, 3)).toBe(5);
    expect(nearestSide(0, 3.8)).toBe(4);
  });
});

describe('automatic camera framing', () => {
  it('fits the whole board for the overview on desktop and phone', () => {
    for (const viewport of [desktop, phone]) {
      const goal = overviewGoal(0, viewport);
      const position = cameraPosition(goal);
      expect(position.y).toBeGreaterThan(8);
      expect(goal.distance).toBeLessThan(80);
    }
  });

  it('follows closer than the overview and stays above the table outside the moving side', () => {
    const anchor = { x: 1, z: 5.5 };
    const follow = followGoal(anchor, 0, 0, desktop, 'follow');
    const landing = followGoal(anchor, 0, 0, desktop, 'landing');
    expect(follow.distance).toBeLessThan(overviewGoal(0, desktop).distance);
    expect(landing.distance).toBeLessThan(follow.distance);
    const position = cameraPosition(follow);
    expect(position.y).toBeGreaterThan(2);
    expect(position.z).toBeGreaterThan(anchor.z);
  });

  it('widens slightly at corners', () => {
    expect(cornerness(5)).toBe(1);
    expect(cornerness(7.5)).toBe(0);
    const anchor = { x: -5.5, z: 5.5 };
    expect(followGoal(anchor, 0.5, 1, desktop, 'follow').distance).toBeGreaterThan(followGoal(anchor, 0.5, 0, desktop, 'follow').distance);
  });
});
