import { describe, expect, it } from 'vitest';
import { getGridPosition } from '../../config/board.presentation';
import {
  BOARD_HALF, CENTRE_SIZE, forwardSteps, nearestAngle, outwardAzimuth, spacesAhead, TILE_COUNT, tilePlacement, tokenSpot, travelYaw,
} from './board.layout';
import { overviewShot, shotPosition, springStep, travelShot, type CameraViewport } from './camera';

const desktop: CameraViewport = { width: 1440, height: 900, fov: 38, insets: { top: 84, right: 340, bottom: 104, left: 340 } };
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
        const sign = (value: number) => Math.abs(value) < 1e-9 ? 0 : Math.sign(value);
        expect(sign(place.x - x)).toBe(Math.sign(second.gridColumn - gridColumn));
        expect(sign(place.z - z)).toBe(Math.sign(second.gridRow - gridRow));
      }
    }
  });

  it('keeps the classic proportions: the open centre is most of the board', () => {
    expect(CENTRE_SIZE / (BOARD_HALF * 2)).toBeGreaterThan(0.6);
  });

  it('keeps every waiting piece on its own space', () => {
    for (let index = 0; index < TILE_COUNT; index++) {
      const tile = tilePlacement(index);
      for (let count = 1; count <= 4; count++) {
        for (let slot = 0; slot < count; slot++) {
          const [x, z] = tokenSpot(index, slot, count);
          expect(Math.abs(x - tile.x)).toBeLessThan(Math.max(tile.width, tile.depth) / 2 - 0.25);
          expect(Math.abs(z - tile.z)).toBeLessThan(Math.max(tile.width, tile.depth) / 2 - 0.25);
        }
      }
    }
  });

  it('points outwards square to each side and diagonally at corners', () => {
    expect(outwardAzimuth(tilePlacement(2).x, tilePlacement(2).z)).toBeCloseTo(0, 1);
    expect(outwardAzimuth(tilePlacement(7).x, tilePlacement(7).z)).toBeCloseTo(-Math.PI / 2, 1);
    expect(outwardAzimuth(tilePlacement(5).x, tilePlacement(5).z)).toBeCloseTo(-Math.PI / 4, 5);
  });

  it('turns the route direction smoothly along the whole loop', () => {
    let previous = travelYaw(tilePlacement(0).x, tilePlacement(0).z);
    for (let index = 0; index < TILE_COUNT; index++) {
      const from = tilePlacement(index);
      const to = tilePlacement(index + 1);
      for (let t = 0; t <= 1; t += 0.05) {
        const yaw = nearestAngle(travelYaw(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t), previous);
        expect(Math.abs(yaw - previous)).toBeLessThan(0.35);
        previous = yaw;
      }
    }
    // Bottom-row pieces travel towards -x.
    expect(Math.cos(travelYaw(tilePlacement(2).x, tilePlacement(2).z))).toBeCloseTo(-1, 2);
  });

  it('counts forward spaces with wrapping', () => {
    expect(forwardSteps(18, 3)).toBe(5);
    expect(spacesAhead(18, 3, 3)).toEqual([19, 0, 1]);
    expect(spacesAhead(18, 19, 3)).toEqual([19]);
  });
});

describe('automatic camera framing', () => {
  it('fits the whole board for the overview on desktop and phone', () => {
    for (const viewport of [desktop, phone]) {
      const shot = overviewShot(0, viewport);
      expect(shotPosition(shot).y).toBeGreaterThan(8);
      expect(shot.distance).toBeLessThan(80);
    }
  });

  it('travels closer than the overview, outside the moving side and above the table', () => {
    const tile = tilePlacement(2);
    const follow = travelShot(tile, [3, 4, 5], 5, desktop, 'follow');
    const landing = travelShot(tile, [], 2, desktop, 'landing');
    expect(follow.distance).toBeLessThan(overviewShot(0, desktop).distance);
    expect(landing.distance).toBeLessThanOrEqual(follow.distance);
    const position = shotPosition(follow);
    expect(position.y).toBeGreaterThan(2);
    expect(position.z).toBeGreaterThan(BOARD_HALF);
  });

  it('springs settle on their goal without overshooting', () => {
    let value = 0;
    let velocity = 0;
    let highest = 0;
    for (let frame = 0; frame < 240; frame++) {
      [value, velocity] = springStep(value, velocity, 1, 6, 1 / 60);
      highest = Math.max(highest, value);
    }
    expect(value).toBeCloseTo(1, 3);
    expect(highest).toBeLessThanOrEqual(1 + 1e-9);
  });
});
