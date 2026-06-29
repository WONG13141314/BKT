// Hook for local game state derived from server broadcasts

export function useGameState() {
  // TODO: Store and expose game state received from socket events
  return {
    gameState: null,
    currentPlayer: null,
    isMyTurn: false,
  };
}
