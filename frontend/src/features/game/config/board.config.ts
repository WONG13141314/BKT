// ============================================
// Board Configuration — Frontend
// 28-tile layout with math-themed names and color groups
// ============================================

import { TileConfig, ColorGroup } from '../types/game.types';

// ---- Color Group Definitions ----

export const COLOR_GROUPS: Record<string, ColorGroup> = {
  brown:     { name: 'brown',     color: '#8B4513', tileIndices: [1, 3],    houseCost: 50 },
  lightblue: { name: 'lightblue', color: '#87CEEB', tileIndices: [5, 8],    houseCost: 50 },
  pink:      { name: 'pink',      color: '#FF69B4', tileIndices: [9, 11],   houseCost: 100 },
  orange:    { name: 'orange',    color: '#FF8C00', tileIndices: [13, 15],  houseCost: 100 },
  red:       { name: 'red',       color: '#DC143C', tileIndices: [16, 18],  houseCost: 150 },
  yellow:    { name: 'yellow',    color: '#FFD700', tileIndices: [20, 22],  houseCost: 150 },
  green:     { name: 'green',     color: '#2E8B57', tileIndices: [23, 25],  houseCost: 200 },
  blue:      { name: 'blue',      color: '#4169E1', tileIndices: [27],      houseCost: 200 },
};

// ---- 28-Tile Board Layout ----

export const BOARD_TILES: TileConfig[] = [
  // Bottom row: Right to Left (indices 0–7)
  { index: 0,  type: 'GO',              name: 'GO',               colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 1,  type: 'PROPERTY',        name: 'Number Lane',      colorGroup: 'brown',     price: 60,  baseRent: 20,  houseCost: 50 },
  { index: 2,  type: 'COMMUNITY_CHEST', name: 'Community Chest',  colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 3,  type: 'PROPERTY',        name: 'Digit Drive',      colorGroup: 'brown',     price: 80,  baseRent: 25,  houseCost: 50 },
  { index: 4,  type: 'TAX',             name: 'Income Tax',       colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 5,  type: 'PROPERTY',        name: 'Math Station',     colorGroup: 'lightblue', price: 100, baseRent: 30,  houseCost: 50 },
  { index: 6,  type: 'CHANCE',          name: 'Chance',           colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  // Left column: Bottom to Top
  { index: 7,  type: 'JAIL',            name: 'Jail',             colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 8,  type: 'PROPERTY',        name: 'Fraction Fields',  colorGroup: 'lightblue', price: 120, baseRent: 35,  houseCost: 50 },
  { index: 9,  type: 'PROPERTY',        name: 'Equation Ave',     colorGroup: 'pink',      price: 140, baseRent: 50,  houseCost: 100 },
  { index: 10, type: 'COMMUNITY_CHEST', name: 'Community Chest',  colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 11, type: 'PROPERTY',        name: 'Calculator Cove',  colorGroup: 'pink',      price: 160, baseRent: 55,  houseCost: 100 },
  { index: 12, type: 'CHANCE',          name: 'Chance',           colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 13, type: 'PROPERTY',        name: 'Geometry Garden',  colorGroup: 'orange',    price: 180, baseRent: 70,  houseCost: 100 },
  // Top row: Left to Right
  { index: 14, type: 'FREE_PARKING',    name: 'Knowledge Boost',  colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 15, type: 'PROPERTY',        name: 'Algebra Alley',    colorGroup: 'orange',    price: 200, baseRent: 75,  houseCost: 100 },
  { index: 16, type: 'PROPERTY',        name: 'Division Drive',   colorGroup: 'red',       price: 220, baseRent: 90,  houseCost: 150 },
  { index: 17, type: 'COMMUNITY_CHEST', name: 'Community Chest',  colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 18, type: 'PROPERTY',        name: 'Percentage Park',  colorGroup: 'red',       price: 240, baseRent: 95,  houseCost: 150 },
  { index: 19, type: 'CHANCE',          name: 'Chance',           colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 20, type: 'PROPERTY',        name: 'Decimal District', colorGroup: 'yellow',    price: 260, baseRent: 110, houseCost: 150 },
  // Right column: Top to Bottom
  { index: 21, type: 'GO_TO_JAIL',      name: 'Go To Jail',       colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 22, type: 'PROPERTY',        name: 'Money Market',     colorGroup: 'yellow',    price: 280, baseRent: 115, houseCost: 150 },
  { index: 23, type: 'PROPERTY',        name: 'Measurement Mile', colorGroup: 'green',     price: 300, baseRent: 130, houseCost: 200 },
  { index: 24, type: 'TAX',             name: 'Luxury Tax',       colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 25, type: 'PROPERTY',        name: 'Formula Fort',     colorGroup: 'green',     price: 320, baseRent: 135, houseCost: 200 },
  { index: 26, type: 'CHANCE',          name: 'Chance',           colorGroup: null,        price: 0,   baseRent: 0,   houseCost: 0 },
  { index: 27, type: 'PROPERTY',        name: 'Pi Plaza',         colorGroup: 'blue',      price: 350, baseRent: 175, houseCost: 200 },
];

// ---- Grid Position Helper ----
// Maps tile index to CSS grid position on an 8×8 board

export function getGridPosition(index: number): { gridRow: number; gridColumn: number } {
  // Bottom row: indices 0–7, row 8, columns 8→1 (right to left)
  if (index >= 0 && index <= 7) return { gridRow: 8, gridColumn: 8 - index };
  // Left column: indices 8–13, column 1, rows 7→2 (bottom to top)
  if (index >= 8 && index <= 13) return { gridRow: 7 - (index - 8), gridColumn: 1 };
  // Top row: indices 14–20, row 1, columns 1→7 (left to right)
  if (index >= 14 && index <= 20) return { gridRow: 1, gridColumn: index - 13 };
  // Right column: indices 21–27, column 8, rows 1→7 (top to bottom)
  if (index >= 21 && index <= 27) return { gridRow: index - 20, gridColumn: 8 };
  return { gridRow: 1, gridColumn: 1 };
}
