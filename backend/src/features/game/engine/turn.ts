// Turn flow: rolling, moving, ending a turn, bankruptcy and the end of the game.

import { GameState } from '../game.types';
import { BOARD_TILES } from '../board.config';
import { GO_SALARY, CLOCK_CAP_MINUTES, MAX_JAIL_TURNS, TOTAL_TILES } from '../game.constants';
import { getActivePlayers, getCurrentPlayer, updatePlayerInList } from './players';

// ---- A. ROLL PHASE ----

/**
 * Open the turn. Jailed players go to the jail decision; everyone else rolls
 * two dice straight away. There is no question before the roll: questions come
 * from the landing (Bank Offer, rent duel, challenge card) and from Math Escape.
 * An earlier "Roll Challenge" asked a question before every roll; it was
 * removed, and `diceCount` survives only for older saved snapshots.
 */
export function startRollPhase(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  // If player is in jail → jail decision instead (unless max jail turns reached)
  if (player.isInJail) {
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
        ...p,
        isInJail: false,
        jailTurns: 0,
      }));
      return startRollPhase({ ...state, players: updatedPlayers });
    }
    return { ...state, turnPhase: 'JAIL_DECISION' };
  }

  return {
    ...state,
    diceValues: [rollDie(), rollDie()],
    diceRollId: state.diceRollId + 1,
    diceCount: 2,
    turnPhase: 'MOVING',
    currentChallenge: null,
  };
}

/** Roll a fair d6. */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---- B. MOVING ----

export function movePlayer(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const totalMovement = state.diceValues[0] + state.diceValues[1]; // Pure dice, no modifier
  const oldPosition = player.position;
  const newPosition = (oldPosition + totalMovement) % TOTAL_TILES;
  const passedGo = newPosition < oldPosition; // Wrapped around

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    position: newPosition,
    money: passedGo ? p.money + GO_SALARY : p.money,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'RESOLVE_TILE',
  };
}

// ---- D. END TURN ----

export function endTurn(state: GameState): GameState {

  // Check bankruptcy
  let updatedState = checkBankruptcy(state);

  // Once the wall-clock cap is hit we finish the current lap, then stop. This is
  // a flag on the state, not a game-over — returning early here used to skip the
  // turn advance and strand the current player in END_TURN.
  if (!updatedState.isFinalRound) {
    const elapsedMinutes = (Date.now() - updatedState.gameStartTime) / (1000 * 60);
    if (elapsedMinutes >= CLOCK_CAP_MINUTES) {
      updatedState = { ...updatedState, isFinalRound: true };
    }
  }

  // Check game end conditions
  const gameEnd = checkGameEnd(updatedState);
  if (gameEnd) return gameEnd;

  // Advance to next active player
  let nextIdx = (updatedState.currentPlayerIndex + 1) % updatedState.players.length;
  let nextRound = updatedState.round;

  // Skip bankrupt players
  let safety = 0;
  while (updatedState.players[nextIdx].isBankrupt && safety < updatedState.players.length) {
    nextIdx = (nextIdx + 1) % updatedState.players.length;
    safety++;
  }

  // New round: find the first active (non-bankrupt) player index
  const firstActiveIdx = updatedState.players.findIndex(p => !p.isBankrupt);
  // A new round starts when we wrap back to (or past) the first active player
  if (nextIdx <= updatedState.currentPlayerIndex && firstActiveIdx !== -1) {
    // Only increment if we truly wrapped around past the first active player
    if (nextIdx <= firstActiveIdx || updatedState.currentPlayerIndex >= firstActiveIdx) {
      nextRound++;
    }
  }

  if (nextRound > updatedState.maxRounds) {
    return { ...updatedState, phase: 'FINISHED' };
  }

  const nextState: GameState = {
    ...updatedState,
    currentPlayerIndex: nextIdx,
    round: nextRound,
    turnPhase: 'ROLL_PHASE',
    pendingTileEvent: null,
    currentChallenge: null,
    duelState: null,
  };

  // Jail options are the first action of a jailed turn. Reuse the roll entry
  // point so a completed sentence still releases the player and rolls normally.
  return getCurrentPlayer(nextState).isInJail ? startRollPhase(nextState) : nextState;
}

// ---- BANKRUPTCY & GAME END ----

function checkBankruptcy(state: GameState): GameState {
  const updatedPlayers = state.players.map((p) => {
    if (p.isBankrupt) return p;
    if (p.money < 0 && p.properties.length === 0) {
      return { ...p, isBankrupt: true };
    }
    if (p.money >= 0) return p;

    // Auto-sell the cheapest properties until the debt is cleared. Selling only
    // one per turn used to leave a player in debt and still playing for turns.
    const cheapestFirst = [...p.properties].sort(
      (a, b) => (BOARD_TILES[a]?.price ?? 0) - (BOARD_TILES[b]?.price ?? 0)
    );
    let money = p.money;
    const sold = new Set<number>();
    for (const tileIndex of cheapestFirst) {
      if (money >= 0) break;
      money += Math.floor((BOARD_TILES[tileIndex]?.price ?? 0) * 0.5);
      sold.add(tileIndex);
    }
    const properties = p.properties.filter((idx) => !sold.has(idx));
    return { ...p, money, properties, isBankrupt: money < 0 && properties.length === 0 };
  });

  // Update property ownership for sold properties
  const ownedByPlayers = new Set(updatedPlayers.flatMap((p) => p.properties));
  const updatedProperties = state.properties.map((prop) => {
    if (prop.ownerId && !ownedByPlayers.has(prop.tileIndex)) {
      return { ...prop, ownerId: null, isLeveledUp: false };
    }
    return prop;
  });

  return { ...state, players: updatedPlayers, properties: updatedProperties };
}

/** Returns a FINISHED state if the game is over, otherwise null. */
function checkGameEnd(state: GameState): GameState | null {
  const activePlayers = getActivePlayers(state);

  // Last player standing
  if (activePlayers.length <= 1) {
    return { ...state, phase: 'FINISHED' };
  }

  // Round cap
  if (state.round > state.maxRounds) {
    return { ...state, phase: 'FINISHED' };
  }

  // Clock cap reached and the last active player has now had their turn
  if (state.isFinalRound) {
    const lastActiveIdx = state.players.reduce(
      (last, p, i) => (p.isBankrupt ? last : i),
      -1
    );
    if (state.currentPlayerIndex >= lastActiveIdx) {
      return { ...state, phase: 'FINISHED' };
    }
  }

  return null;
}
