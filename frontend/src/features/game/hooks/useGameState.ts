// Hook for local game state management
// Stores and exposes game state received from socket events

import { useState, useCallback, useMemo } from 'react';
import {
  GameState,
  MathChallenge,
  AnswerResult,
  FinalScore,
  Player,
} from '../types/game.types';
import { GameNotificationData } from '../components/GameNotification';

interface UseGameStateReturn {
  gameState: GameState | null;
  currentPlayer: Player | null;
  isMyTurn: boolean;
  currentChallenge: MathChallenge | null;
  answerResult: AnswerResult | null;
  finalScores: FinalScore[] | null;
  notifications: GameNotificationData[];
  // Setters (called by socket event handlers)
  setGameState: (state: GameState) => void;
  setAnswerResult: (result: AnswerResult | null) => void;
  setFinalScores: (scores: FinalScore[]) => void;
  addNotification: (type: GameNotificationData['type'], message: string) => void;
  dismissNotification: (id: string) => void;
}

export function useGameState(myPlayerId: string): UseGameStateReturn {
  const [gameState, setGameStateRaw] = useState<GameState | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [finalScores, setFinalScores] = useState<FinalScore[] | null>(null);
  const [notifications, setNotifications] = useState<GameNotificationData[]>([]);

  const setGameState = useCallback((state: GameState) => {
    setGameStateRaw(state);
  }, []);

  const currentPlayer = useMemo(() => {
    if (!gameState) return null;
    return gameState.players[gameState.currentPlayerIndex] || null;
  }, [gameState]);

  const isMyTurn = useMemo(() => {
    return currentPlayer?.userId === myPlayerId || currentPlayer?.id === myPlayerId;
  }, [currentPlayer, myPlayerId]);

  const currentChallenge = gameState?.currentChallenge ?? null;

  const addNotification = useCallback((type: GameNotificationData['type'], message: string) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    gameState,
    currentPlayer,
    isMyTurn,
    currentChallenge,
    answerResult,
    finalScores,
    notifications,
    setGameState,
    setAnswerResult,
    setFinalScores,
    addNotification,
    dismissNotification,
  };
}
