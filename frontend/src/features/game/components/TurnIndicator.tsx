import './TurnIndicator.css';

interface TurnIndicatorProps {
  currentPlayerName?: string;
  isMyTurn?: boolean;
}

export function TurnIndicator({ currentPlayerName = "Alice", isMyTurn = true }: TurnIndicatorProps) {
  return (
    <div className={`turn-indicator-container ${isMyTurn ? 'my-turn' : ''}`}>
      <div className="turn-indicator glass-panel">
        <div className="turn-pulse"></div>
        <div className="turn-text">
          {isMyTurn ? (
            <span className="text-gradient font-bold">It's Your Turn!</span>
          ) : (
            <span>Waiting for <strong>{currentPlayerName}</strong>...</span>
          )}
        </div>
      </div>
    </div>
  );
}
