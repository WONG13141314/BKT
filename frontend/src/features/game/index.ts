export { Board } from './components/Board';
export { GamePage } from './pages/GamePage';
export { GameLobby } from './components/GameLobby';
export { DiceRoller } from './components/DiceRoller';
export { PlayerPanel } from './components/PlayerPanel';
export { TurnIndicator } from './components/TurnIndicator';
export { GameOverScreen } from './components/GameOverScreen';
export { GameNotifications } from './components/GameNotification';
export { ColumnQuestion } from './components/ColumnQuestion';
export { McqQuestion } from './components/McqQuestion';
export { ChallengeCardModal } from './components/ChallengeCardModal';
export { useGameSocket } from './hooks/useGameSocket';
export { useGameState } from './hooks/useGameState';
export type {
  GameState,
  Player,
  TileConfig,
  TileType,
  TurnPhase,
  MathChallenge,
  AnswerResult,
  FinalScore,
  MasteryReport,
  PropertyState,
  ChallengeContext,
  RewardResult,
  ChallengeCard,
  TileEvent,
  ColumnQuestion as ColumnQuestionType,
  McqQuestion as McqQuestionType,
} from './types/game.types';
