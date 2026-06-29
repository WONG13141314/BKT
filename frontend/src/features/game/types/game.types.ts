// Game-related TypeScript types

export interface Player {
  id: string;
  name: string;
  position: number;
  money: number;
  color: string;
  properties: string[];
  isActive: boolean;
}

export interface Tile {
  index: number;
  type: TileType;
  name: string;
  price?: number;
  rent?: number;
  ownerId?: string;
}

export enum TileType {
  GO = 'GO',
  PROPERTY = 'PROPERTY',
  QUESTION = 'QUESTION',
  TAX = 'TAX',
  CHANCE = 'CHANCE',
  FREE_PARKING = 'FREE_PARKING',
}

export interface GameState {
  id: string;
  players: Player[];
  tiles: Tile[];
  currentPlayerIndex: number;
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  diceValues: [number, number];
}
