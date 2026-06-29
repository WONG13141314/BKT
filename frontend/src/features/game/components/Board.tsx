import './Board.css';

// 28 tiles for an 8x8 board perimeter
const TILES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  name: i === 0 ? 'GO' : (i % 7 === 0 ? `Corner ${i}` : `Prop ${i}`),
  type: i % 7 === 0 ? 'corner' : 'property',
  color: i % 3 === 0 ? 'var(--color-primary)' : 'var(--color-secondary)'
}));

// Helper to assign grid positions (8x8)
const getGridArea = (index: number) => {
  if (index >= 0 && index <= 7) return { gridRow: 8, gridColumn: 8 - index }; // Bottom row (Right to Left)
  if (index >= 8 && index <= 14) return { gridRow: 8 - (index - 7), gridColumn: 1 }; // Left col (Bottom to Top)
  if (index >= 15 && index <= 21) return { gridRow: 1, gridColumn: index - 13 }; // Top row (Left to Right)
  if (index >= 22 && index <= 27) return { gridRow: index - 20, gridColumn: 8 }; // Right col (Top to Bottom)
  return {};
};

export function Board() {
  return (
    <div className="board-container">
      <div className="game-board">
        {/* Render the perimeter tiles */}
        {TILES.map((tile, i) => (
          <div 
            key={tile.id} 
            className={`tile ${tile.type} tile-index-${i}`} 
            style={{ 
              ...getGridArea(i),
              borderTopColor: (i > 0 && i < 7) ? tile.color : 'transparent', // just some flavor
            }}
          >
            <div className="tile-content">
              <span className="tile-name">{tile.name}</span>
              {tile.type === 'property' && <span className="tile-price">$100</span>}
            </div>
          </div>
        ))}
        
        {/* Center of the board */}
        <div className="board-center">
          <div className="center-content glass-panel">
            <h2 className="text-gradient board-logo">MATH MONOPOLY</h2>
            <p className="board-subtitle">Learn & Earn</p>
          </div>
        </div>
      </div>
    </div>
  );
}
