// Hook for dice animation and roll emission

export function useDiceRoll() {
  // TODO: Manage dice animation state, emit roll event
  return {
    isRolling: false,
    diceValues: [1, 1] as [number, number],
    roll: () => {},
  };
}
