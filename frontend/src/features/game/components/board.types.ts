import type { Player, PropertyState, TileConfig } from '../types/game.types';
import type { SafeInsets } from './tabletop/camera';

/** A Challenge Card being drawn from the deck in the centre of the board. */
export interface TableCardDraw {
  /** Changes for each new draw. */
  id: string;
  card: { name: string; description: string; isMathCard: boolean };
  /** `ready`: the top card waits on the deck; `drawing`: it lifts, turns and rises; `shown`: it has left the table. */
  stage: 'ready' | 'drawing' | 'shown';
  /** The card has risen to the viewer; where it is on screen, in CSS pixels. */
  onDrawn: (point: { x: number; y: number } | null) => void;
}

/** The dice in the centre of the board. */
export interface BoardDice {
  values: [number, number];
  rollId: number;
  animate: boolean;
  onRollingChange: (rolling: boolean) => void;
  onReady: () => void;
}

/** What both boards, the 3D table and the flat board, are given to draw. */
export interface BoardViewProps {
  players: Player[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  /** The space lifted out of the board: the landed or chosen space, or none while moving. */
  highlightTile: number | null;
  /** The space the moving piece has just reached; it flashes briefly. */
  stepTile: { index: number; id: number } | null;
  dice: BoardDice;
  /** The screen edges the game interface covers; the board is framed inside the rest. */
  insets: SafeInsets;
  onTileSelect: (index: number) => void;
  /** Called once the board has drawn. */
  onReady: () => void;
  /** A Challenge Card being drawn from the deck, or null. */
  cardDraw: TableCardDraw | null;
}
