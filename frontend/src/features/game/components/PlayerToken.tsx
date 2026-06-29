// Game feature — Animated player piece on the board

interface PlayerTokenProps {
  playerId: string;
  position: number;
  color: string;
}

export function PlayerToken({ playerId, position, color }: PlayerTokenProps) {
  return (
    <div
      className="player-token"
      data-player-id={playerId}
      data-position={position}
      style={{ backgroundColor: color }}
    >
      {/* TODO: Animate movement between tiles */}
    </div>
  );
}
