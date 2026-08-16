import type {
  GameState,
  PlayerState,
  PropertyState,
  TileConfig,
  TileEvent,
  TurnPhase,
} from './game.types';

/** The exhaustive allow-list for a player that may be shared with the room. */
export type PublicPlayerState = Pick<PlayerState,
  | 'id' | 'playerId' | 'name' | 'position' | 'money' | 'color' | 'tokenType'
  | 'properties' | 'isInJail' | 'jailTurns' | 'isBankrupt' | 'streak'
  | 'totalCorrect' | 'totalQuestions' | 'hasLevelUpToken' | 'hasRentShield'
  | 'hasDiscountToken' | 'isBot' | 'botDifficulty'
>;

/** The exhaustive allow-list for the room-wide game-state event. */
export interface PublicGameState {
  id: string;
  players: PublicPlayerState[];
  tiles: TileConfig[];
  properties: PropertyState[];
  currentPlayerIndex: number;
  phase: GameState['phase'];
  turnPhase: TurnPhase;
  round: number;
  maxRounds: number;
  diceValues: [number, number];
  diceRollId: number;
  diceCount: 1 | 2;
  duelState: null;
  pendingTileEvent: TileEvent | null;
  gameStartTime: number;
  isFinalRound: boolean;
  phaseDeadline: number | null;
}

function toPublicPlayerState(player: PlayerState): PublicPlayerState {
  return {
    id: player.id,
    playerId: player.playerId,
    name: player.name,
    position: player.position,
    money: player.money,
    color: player.color,
    tokenType: player.tokenType,
    properties: player.properties,
    isInJail: player.isInJail,
    jailTurns: player.jailTurns,
    isBankrupt: player.isBankrupt,
    streak: player.streak,
    totalCorrect: player.totalCorrect,
    totalQuestions: player.totalQuestions,
    hasLevelUpToken: player.hasLevelUpToken,
    hasRentShield: player.hasRentShield,
    hasDiscountToken: player.hasDiscountToken,
    isBot: player.isBot,
    botDifficulty: player.botDifficulty,
  };
}

/**
 * Produces the room-visible snapshot without copying any server-only fields.
 * New private fields remain private until deliberately added to this contract.
 */
export function toPublicGameState(state: GameState): PublicGameState {
  return {
    id: state.id,
    players: state.players.map(toPublicPlayerState),
    tiles: state.tiles,
    properties: state.properties,
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    turnPhase: state.turnPhase,
    round: state.round,
    maxRounds: state.maxRounds,
    diceValues: state.diceValues,
    diceRollId: state.diceRollId,
    diceCount: state.diceCount,
    duelState: null,
    pendingTileEvent: state.pendingTileEvent,
    gameStartTime: state.gameStartTime,
    isFinalRound: state.isFinalRound,
    phaseDeadline: state.phaseDeadline ?? null,
  };
}
