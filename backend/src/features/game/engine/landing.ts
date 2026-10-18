// Resolving the space a player lands on, including Tax and Lucky Break.

import { GameState, PlayerState, LuckyBreakReward } from '../game.types';
import { BOARD_TILES } from '../board.config';
import { TAX_AMOUNT, LUXURY_TAX_AMOUNT, LUCKY_BREAK_CASH_OPTIONS, LUCKY_BREAK_TOKEN_CHANCE } from '../game.constants';
import { resolveChallengeCardTile } from './cards';
import { resolveGoToJail } from './jail';
import { getCurrentPlayer, updatePlayerInList } from './players';
import { resolvePropertyTile } from './property';

// ---- C. RESOLVE TILE ----

export function resolveTileEvent(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const tile = BOARD_TILES[player.position];

  if (!tile) return { ...state, turnPhase: 'END_TURN' };

  switch (tile.type) {
    case 'GO':
      // Already collected salary in movePlayer if passed GO
      return { ...state, turnPhase: 'END_TURN' };

    case 'PROPERTY':
      return resolvePropertyTile(state, player, tile.index);

    case 'TAX':
      return resolveTaxTile(state, tile.index);

    case 'CHALLENGE_CARD':
      return resolveChallengeCardTile(state, player);

    case 'LUCKY_BREAK':
      return resolveLuckyBreak(state, player);

    case 'REST':
      return { ...state, turnPhase: 'END_TURN' };

    case 'GO_TO_JAIL':
      return resolveGoToJail(state);

    case 'JAIL':
      // "Just Visiting"
      return { ...state, turnPhase: 'END_TURN' };

    default:
      return { ...state, turnPhase: 'END_TURN' };
  }
}

// ---- TAX ----

function resolveTaxTile(state: GameState, tileIndex: number): GameState {
  const tile = BOARD_TILES[tileIndex];
  const taxAmount = tile.name === 'Cukai Mewah' ? LUXURY_TAX_AMOUNT : TAX_AMOUNT;

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: p.money - taxAmount,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
    pendingTileEvent: {
      type: 'TAX',
      tileIndex,
      tileName: tile.name,
      taxAmount,
    },
  };
}

// ---- LUCKY BREAK ----

function resolveLuckyBreak(state: GameState, player: PlayerState): GameState {
  let reward: LuckyBreakReward;

  if (Math.random() < LUCKY_BREAK_TOKEN_CHANCE) {
    reward = { type: 'levelUpToken' };
  } else {
    const amount = LUCKY_BREAK_CASH_OPTIONS[Math.floor(Math.random() * LUCKY_BREAK_CASH_OPTIONS.length)];
    reward = { type: 'cash', amount };
  }

  let updatedPlayers: PlayerState[];
  if (reward.type === 'cash') {
    updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      money: p.money + reward.amount!,
    }));
  } else {
    updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      hasLevelUpToken: true,
    }));
  }

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
    pendingTileEvent: {
      type: 'LUCKY_BREAK',
      tileIndex: player.position,
      tileName: 'Lucky Break',
      luckyBreakReward: reward,
    },
  };
}
