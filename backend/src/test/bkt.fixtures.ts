import type { SelectionInput } from '../bkt/bkt.selector';
import type { GeneratedQuestion } from '../bkt/question.generator';
import { initializeGameState } from '../features/game/game.engine';
import type { GameState, PlayerState } from '../features/game/game.types';
import type { SkillName } from '../features/game/game.constants';

const SKILLS: SkillName[] = ['Addition', 'Subtraction', 'Multiplication', 'Division'];

export interface BaseInputOverrides extends Partial<Omit<SelectionInput, 'masteryStates' | 'consecutiveFailures' | 'skillAttempts'>> {
  mastery?: number;
  attempts?: number;
}

export function baseInput(overrides: BaseInputOverrides = {}): SelectionInput {
  const { mastery = 0.2, attempts = 10, ...input } = overrides;
  const bySkill = Object.fromEntries(SKILLS.map((skill) => [skill, mastery]));
  const noFailures = Object.fromEntries(SKILLS.map((skill) => [skill, 0]));

  return {
    masteryStates: bySkill,
    context: 'CHALLENGE_CARD',
    consecutiveFailures: noFailures,
    skillAttempts: Object.fromEntries(SKILLS.map((skill) => [skill, attempts])),
    ...input,
  };
}

export function masteryFor(difficulty: 1 | 2 | 3): number {
  return ({ 1: 0.2, 2: 0.6, 3: 0.9 } as const)[difficulty];
}

export function generatedAddition(a: number, b: number): GeneratedQuestion {
  const answer = a + b;
  return {
    questionData: {
      type: 'column',
      operation: '+',
      topNumber: a,
      bottomNumber: b,
      placeValues: {
        tens: { top: Math.floor(a / 10) % 10, bottom: Math.floor(b / 10) % 10 },
        ones: { top: a % 10, bottom: b % 10 },
      },
      answer,
      hasRegrouping: a % 10 + (b % 10) >= 10,
      answerDigits: {
        tens: Math.floor(answer / 10) % 10,
        ones: answer % 10,
      },
      missingPosition: 'answer',
    },
    text: `${a} + ${b} = (?)`,
    options: [String(answer - 1), String(answer), String(answer + 1), String(answer + 2)],
    correctIndex: 1,
    difficulty: 1,
    skillName: 'Addition',
  };
}

export function targetAnswer(data: GeneratedQuestion): string {
  return data.options[data.correctIndex];
}

const PLAYERS = [
  { id: 'seat-1', playerId: 'db-player-1', name: 'Aina', color: '#6366f1', order: 0 },
  { id: 'seat-2', playerId: 'db-player-2', name: 'Ben', color: '#f59e0b', order: 1 },
];

export function readyState(): GameState {
  return initializeGameState('game_TEST', PLAYERS, 'db-game-test');
}

export function onUnownedProperty(): GameState {
  const state = readyState();
  return {
    ...state,
    turnPhase: 'BUY_DECISION',
    players: state.players.map((player, index) => index === state.currentPlayerIndex
      ? { ...player, position: 1 }
      : player),
    pendingTileEvent: {
      type: 'PROPERTY',
      tileIndex: 1,
      tileName: 'Tambah Alley',
      propertyPrice: 80,
      propertyOwner: null,
    },
  };
}

export function buildableState(overrides: Partial<PlayerState> = {}): GameState {
  const state = readyState();
  const player = { ...state.players[state.currentPlayerIndex], properties: [1, 2], ...overrides };
  return {
    ...state,
    players: state.players.map((candidate, index) => index === state.currentPlayerIndex ? player : candidate),
    properties: state.properties.map((property) => [1, 2].includes(property.tileIndex)
      ? { ...property, ownerId: player.id }
      : property),
  };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}
