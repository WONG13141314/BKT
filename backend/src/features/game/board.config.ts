// ============================================
// Board Configuration — 20 Tiles
// Standard 1 KSSR themed properties, RM currency
// 5 color sets × 2 properties = 10 properties + 10 specials
// ============================================

import { TileConfig, ColorGroup, PropertyState } from './game.types';
import {
  TOTAL_TILES,
  MONOPOLY_RENT_MULTIPLIER,
  LEVEL_UP_COST_RATIO,
} from './game.constants';

// ---- Color Group Definitions ----

export const COLOR_GROUPS: Record<string, ColorGroup> = {
  blue: {
    name: 'blue',
    color: '#4A90D9',
    tileIndices: [1, 2],
    skillTheme: 'Addition',   // Blue = Addition + Subtraction intro
  },
  orange: {
    name: 'orange',
    color: '#FF8C00',
    tileIndices: [4, 6],
    skillTheme: 'PlaceValue', // Orange = Place Value (ones & tens)
  },
  green: {
    name: 'green',
    color: '#2E8B57',
    tileIndices: [9, 14],
    skillTheme: 'Addition',   // Green = Addition advanced (within 100)
  },
  purple: {
    name: 'purple',
    color: '#8B5CF6',
    tileIndices: [11, 13],
    skillTheme: 'Money',      // Purple = Money recognition (RM/sen)
  },
  red: {
    name: 'red',
    color: '#DC143C',
    tileIndices: [17, 18],
    skillTheme: 'Subtraction', // Red = Subtraction advanced + Money
  },
};

// ---- 20-Tile Board Layout ----

export const BOARD_TILES: TileConfig[] = [
  // === Bottom row: Right to Left (indices 0–5) ===
  {
    index: 0,
    type: 'GO',
    name: 'Mula',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 1,
    type: 'PROPERTY',
    name: 'Tambah Alley',
    colorGroup: 'blue',
    skillTheme: 'Addition',
    price: 80,
    baseRent: 20,
    leveledRent: 50,
  },
  {
    index: 2,
    type: 'PROPERTY',
    name: 'Tolak Lane',
    colorGroup: 'blue',
    skillTheme: 'Subtraction',
    price: 80,
    baseRent: 20,
    leveledRent: 50,
  },
  {
    index: 3,
    type: 'CHALLENGE_CARD',
    name: 'Challenge Card',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 4,
    type: 'PROPERTY',
    name: 'Digit Drive',
    colorGroup: 'orange',
    skillTheme: 'PlaceValue',
    price: 120,
    baseRent: 35,
    leveledRent: 80,
  },

  // === Corner: Jail (index 5) ===
  {
    index: 5,
    type: 'JAIL',
    name: 'Penjara',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },

  // === Left column: Bottom to Top (indices 6–9) ===
  {
    index: 6,
    type: 'PROPERTY',
    name: 'Nombor Nook',
    colorGroup: 'orange',
    skillTheme: 'PlaceValue',
    price: 120,
    baseRent: 35,
    leveledRent: 80,
  },
  {
    index: 7,
    type: 'TAX',
    name: 'Cukai',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 8,
    type: 'CHALLENGE_CARD',
    name: 'Challenge Card',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 9,
    type: 'PROPERTY',
    name: 'Tambah Towers',
    colorGroup: 'green',
    skillTheme: 'Addition',
    price: 160,
    baseRent: 50,
    leveledRent: 110,
  },

  // === Corner: Lucky Break (index 10) ===
  {
    index: 10,
    type: 'LUCKY_BREAK',
    name: 'Lucky Break',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },

  // === Top row: Left to Right (indices 11–14) ===
  {
    index: 11,
    type: 'PROPERTY',
    name: 'Wang Bazaar',
    colorGroup: 'purple',
    skillTheme: 'Money',
    price: 160,
    baseRent: 50,
    leveledRent: 110,
  },
  {
    index: 12,
    type: 'CHALLENGE_CARD',
    name: 'Challenge Card',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 13,
    type: 'PROPERTY',
    name: 'Duit Drive',
    colorGroup: 'purple',
    skillTheme: 'Money',
    price: 200,
    baseRent: 65,
    leveledRent: 140,
  },
  {
    index: 14,
    type: 'PROPERTY',
    name: 'Kira Corner',
    colorGroup: 'green',
    skillTheme: 'Addition',
    price: 200,
    baseRent: 65,
    leveledRent: 140,
  },

  // === Corner: Go to Jail (index 15) ===
  {
    index: 15,
    type: 'GO_TO_JAIL',
    name: 'Ke Penjara',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },

  // === Right column: Top to Bottom (indices 16–19) ===
  {
    index: 16,
    type: 'CHALLENGE_CARD',
    name: 'Challenge Card',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
  {
    index: 17,
    type: 'PROPERTY',
    name: 'Ringgit Row',
    colorGroup: 'red',
    skillTheme: 'Money',
    price: 240,
    baseRent: 80,
    leveledRent: 170,
  },
  {
    index: 18,
    type: 'PROPERTY',
    name: 'Tolak Towers',
    colorGroup: 'red',
    skillTheme: 'Subtraction',
    price: 240,
    baseRent: 80,
    leveledRent: 170,
  },
  {
    index: 19,
    type: 'TAX',
    name: 'Cukai Mewah',
    colorGroup: null,
    skillTheme: null,
    price: 0,
    baseRent: 0,
    leveledRent: 0,
  },
];

// ---- Utility Functions ----

/** Get all tile indices belonging to a color group */
export function getColorGroupTiles(colorGroup: string): number[] {
  return COLOR_GROUPS[colorGroup]?.tileIndices ?? [];
}

/** Check if a player owns all tiles in a color group (monopoly) */
export function ownsFullColorGroup(
  playerProperties: number[],
  colorGroup: string
): boolean {
  const groupTiles = getColorGroupTiles(colorGroup);
  return groupTiles.length > 0 && groupTiles.every((idx) => playerProperties.includes(idx));
}

/**
 * Calculate rent for a property tile.
 * - Base rent if no monopoly and not leveled up
 * - 2× base rent if player owns the full color set (monopoly)
 * - Leveled rent if property is leveled up
 * - Leveled rent × 2 if leveled up AND monopoly (rare but possible)
 */
export function calculateRent(
  tile: TileConfig,
  isLeveledUp: boolean,
  hasMonopoly: boolean
): number {
  const rent = isLeveledUp ? tile.leveledRent : tile.baseRent;
  return hasMonopoly ? rent * MONOPOLY_RENT_MULTIPLIER : rent;
}

/** Get the tile config by index */
export function getTileByIndex(index: number): TileConfig {
  return BOARD_TILES[index];
}

/** Get the level-up cost for a property (50% of purchase price) */
export function getLevelUpCost(tile: TileConfig): number {
  return Math.floor(tile.price * LEVEL_UP_COST_RATIO);
}

/** Calculate total property value for a player (sum of purchase prices) */
export function calculatePropertyValue(ownedTileIndices: number[]): number {
  return ownedTileIndices.reduce((total, idx) => {
    const tile = BOARD_TILES[idx];
    return total + (tile?.price ?? 0);
  }, 0);
}

/** Calculate total level-up value (sum of level-up costs for leveled properties) */
export function calculateLevelUpValue(
  ownedTileIndices: number[],
  properties: PropertyState[]
): number {
  return ownedTileIndices.reduce((total, idx) => {
    const tile = BOARD_TILES[idx];
    const prop = properties.find((p) => p.tileIndex === idx);
    if (prop?.isLeveledUp && tile) {
      return total + getLevelUpCost(tile);
    }
    return total;
  }, 0);
}

/** Initialize property states for all property tiles */
export function initializeProperties(): PropertyState[] {
  return BOARD_TILES
    .filter((t) => t.type === 'PROPERTY')
    .map((t) => ({
      tileIndex: t.index,
      ownerId: null,
      isLeveledUp: false,
    }));
}
