// ============================================
// Board Configuration — Frontend
// 20-tile layout, 5 color groups, RM currency
// Standard 1 KSSR themed properties
// ============================================

import { TileConfig, ColorGroup, SkillName } from '../types/game.types';

// ---- Color Group Definitions ----

export const COLOR_GROUPS: Record<string, ColorGroup> = {
  blue:   { name: 'blue',   color: '#4A90D9', tileIndices: [1, 2],   skillTheme: 'Addition' as SkillName },
  orange: { name: 'orange', color: '#FF8C00', tileIndices: [4, 6],   skillTheme: 'PlaceValue' as SkillName },
  green:  { name: 'green',  color: '#2E8B57', tileIndices: [9, 14],  skillTheme: 'Addition' as SkillName },
  purple: { name: 'purple', color: '#8B5CF6', tileIndices: [11, 13], skillTheme: 'Money' as SkillName },
  red:    { name: 'red',    color: '#DC143C', tileIndices: [17, 18], skillTheme: 'Subtraction' as SkillName },
};

// ---- 20-Tile Board Layout ----

export const BOARD_TILES: TileConfig[] = [
  // Bottom row: Right to Left (indices 0–5)
  { index: 0,  type: 'GO',             name: 'Mula',           colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 1,  type: 'PROPERTY',       name: 'Tambah Alley',   colorGroup: 'blue',   skillTheme: 'Addition',     price: 80,  baseRent: 20, leveledRent: 50 },
  { index: 2,  type: 'PROPERTY',       name: 'Tolak Lane',     colorGroup: 'blue',   skillTheme: 'Subtraction',  price: 80,  baseRent: 20, leveledRent: 50 },
  { index: 3,  type: 'CHALLENGE_CARD', name: 'Challenge Card', colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 4,  type: 'PROPERTY',       name: 'Digit Drive',    colorGroup: 'orange', skillTheme: 'PlaceValue',   price: 120, baseRent: 35, leveledRent: 80 },
  // Corner: Jail
  { index: 5,  type: 'JAIL',           name: 'Penjara',        colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  // Left column: Bottom to Top (indices 6–9)
  { index: 6,  type: 'PROPERTY',       name: 'Nombor Nook',    colorGroup: 'orange', skillTheme: 'PlaceValue',   price: 120, baseRent: 35, leveledRent: 80 },
  { index: 7,  type: 'TAX',            name: 'Cukai',          colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 8,  type: 'CHALLENGE_CARD', name: 'Challenge Card', colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 9,  type: 'PROPERTY',       name: 'Tambah Towers',  colorGroup: 'green',  skillTheme: 'Addition',     price: 160, baseRent: 50, leveledRent: 110 },
  // Corner: Lucky Break
  { index: 10, type: 'LUCKY_BREAK',    name: 'Lucky Break',    colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  // Top row: Left to Right (indices 11–14)
  { index: 11, type: 'PROPERTY',       name: 'Wang Bazaar',    colorGroup: 'purple', skillTheme: 'Money',        price: 160, baseRent: 50, leveledRent: 110 },
  { index: 12, type: 'CHALLENGE_CARD', name: 'Challenge Card', colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 13, type: 'PROPERTY',       name: 'Duit Drive',     colorGroup: 'purple', skillTheme: 'Money',        price: 200, baseRent: 65, leveledRent: 140 },
  { index: 14, type: 'PROPERTY',       name: 'Kira Corner',    colorGroup: 'green',  skillTheme: 'Addition',     price: 200, baseRent: 65, leveledRent: 140 },
  // Corner: Go to Jail
  { index: 15, type: 'GO_TO_JAIL',     name: 'Ke Penjara',     colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  // Right column: Top to Bottom (indices 16–19)
  { index: 16, type: 'CHALLENGE_CARD', name: 'Challenge Card', colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
  { index: 17, type: 'PROPERTY',       name: 'Ringgit Row',    colorGroup: 'red',    skillTheme: 'Money',        price: 240, baseRent: 80, leveledRent: 170 },
  { index: 18, type: 'PROPERTY',       name: 'Tolak Towers',   colorGroup: 'red',    skillTheme: 'Subtraction',  price: 240, baseRent: 80, leveledRent: 170 },
  { index: 19, type: 'TAX',            name: 'Cukai Mewah',    colorGroup: null,     skillTheme: null,           price: 0,   baseRent: 0,  leveledRent: 0 },
];

// ---- Grid Position Helper ----
// Maps tile index to CSS grid position on a 6×6 board (5 tiles per side + corners)

export function getGridPosition(index: number): { gridRow: number; gridColumn: number } {
  // Bottom row: indices 0–5, row 6, columns 6→1 (right to left)
  if (index >= 0 && index <= 5) return { gridRow: 6, gridColumn: 6 - index };

  // Left column: indices 6–9, column 1, rows 5→2 (bottom to top)
  if (index >= 6 && index <= 9) return { gridRow: 5 - (index - 6), gridColumn: 1 };

  // Top row: indices 10–15, row 1, columns 1→6 (left to right)
  if (index >= 10 && index <= 15) return { gridRow: 1, gridColumn: index - 9 };

  // Right column: indices 16–19, column 6, rows 2→5 (top to bottom)
  if (index >= 16 && index <= 19) return { gridRow: index - 14, gridColumn: 6 };

  return { gridRow: 1, gridColumn: 1 };
}

// ---- Utility ----

export function getTileByIndex(index: number): TileConfig {
  return BOARD_TILES[index];
}

export function getColorGroupTiles(colorGroup: string): number[] {
  return COLOR_GROUPS[colorGroup]?.tileIndices ?? [];
}
