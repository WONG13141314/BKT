import type { GameState } from '../types/game.types';

/**
 * What the board should draw for this server state.
 *
 * - While an answer card is open over a roll that already happened (a correct
 *   Math Escape), keep the earlier dice and no movement target behind the card.
 * - During MOVING the server keeps the committed position unchanged until the
 *   board acknowledges the move, so give the board the dice destination as a
 *   presentation-only target for its pawn animation.
 */
export function boardPresentationState(
  gameState: GameState,
  holdRollForAnswer: boolean,
  shownDice: { rollId: number; values: [number, number] } | null,
): GameState {
  if (holdRollForAnswer) {
    return {
      ...gameState,
      turnPhase: 'JAIL_CHALLENGE',
      diceRollId: shownDice?.rollId ?? gameState.diceRollId - 1,
      diceValues: shownDice?.values ?? gameState.diceValues,
    };
  }
  if (gameState.turnPhase !== 'MOVING') return gameState;
  return {
    ...gameState,
    players: gameState.players.map((seat, index) => index === gameState.currentPlayerIndex
      ? { ...seat, position: (seat.position + gameState.diceValues[0] + gameState.diceValues[1]) % gameState.tiles.length }
      : seat),
  };
}
