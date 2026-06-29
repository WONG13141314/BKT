// Game feature — Individual tile component
// TODO: Render tile based on type (PROPERTY, QUESTION, GO, TAX, etc.)

interface TileProps {
  index: number;
  type: string;
}

export function Tile({ index, type }: TileProps) {
  return <div className={`tile tile--${type}`} data-index={index}>{/* TODO */}</div>;
}
