// Hook for Socket.IO game event listeners — MathOpoly Redesign
// All new events for the redesigned turn flow

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { GameState, MathChallenge, AnswerResult, FinalScore, MasteryReport } from '../types/game.types';

interface GameSocketEvents {
  onStateUpdate: (state: GameState) => void;
  onChallenge: (data: { challenge: MathChallenge; playerId: string }) => void;
  onChallengeStarted: (data: { playerId: string; skillName: string; context: string }) => void;
  onAnswerResult: (data: { result: AnswerResult; playerId: string }) => void;
  onGameFinished: (data: { scores: FinalScore[]; masteryReports: MasteryReport[] | null }) => void;
  onBotAction: (data: { botId: string; botName: string; action: string }) => void;
  onError: (data: { message: string }) => void;
}

export function useGameSocket(gameId: string | null, events: GameSocketEvents) {
  const { socket } = useSocket();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!socket || !gameId) return;

    socket.emit('game:request-state', { gameId });

    const handleState = (data: { state: GameState }) => eventsRef.current.onStateUpdate(data.state);
    const handleChallenge = (data: { challenge: MathChallenge; playerId: string }) => eventsRef.current.onChallenge(data);
    const handleChallengeStarted = (data: { playerId: string; skillName: string; context: string }) => eventsRef.current.onChallengeStarted(data);
    const handleAnswerResult = (data: { result: AnswerResult; playerId: string }) => eventsRef.current.onAnswerResult(data);
    const handleFinished = (data: { scores: FinalScore[]; masteryReports: MasteryReport[] | null }) => eventsRef.current.onGameFinished(data);
    const handleBotAction = (data: { botId: string; botName: string; action: string }) => eventsRef.current.onBotAction(data);
    const handleError = (data: { message: string }) => eventsRef.current.onError(data);

    socket.on('game:state', handleState);
    socket.on('game:challenge', handleChallenge);
    socket.on('game:challenge-started', handleChallengeStarted);
    socket.on('game:answer-result', handleAnswerResult);
    socket.on('game:finished', handleFinished);
    socket.on('game:bot-action', handleBotAction);
    socket.on('game:error', handleError);

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:challenge', handleChallenge);
      socket.off('game:challenge-started', handleChallengeStarted);
      socket.off('game:answer-result', handleAnswerResult);
      socket.off('game:finished', handleFinished);
      socket.off('game:bot-action', handleBotAction);
      socket.off('game:error', handleError);
    };
  }, [socket, gameId]);

  // ---- Emit Helpers ----

  const emit = useCallback((event: string, data?: Record<string, any>) => {
    if (!socket || !gameId) return;
    socket.emit(event, { gameId, ...data });
  }, [socket, gameId]);

  // Roll
  const emitRoll = useCallback(() => emit('game:roll'), [emit]);

  // Dice Challenge Answer
  const emitDiceAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:dice-answer', { selectedIndex, timeMs }), [emit]);

  // Buy
  const emitBuyFull = useCallback(() => emit('game:buy-full'), [emit]);
  const emitSmartBuy = useCallback(() => emit('game:smart-buy'), [emit]);
  const emitSmartBuyAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:smart-buy-answer', { selectedIndex, timeMs }), [emit]);
  const emitSkipBuy = useCallback(() => emit('game:skip-buy'), [emit]);

  // Rent
  const emitPayRent = useCallback(() => emit('game:pay-rent'), [emit]);
  const emitRentDefense = useCallback(() => emit('game:rent-defense'), [emit]);
  const emitRentDefenseAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:rent-defense-answer', { selectedIndex, timeMs }), [emit]);

  // Challenge Card
  const emitCardAck = useCallback(() => emit('game:card-ack'), [emit]);
  const emitCardAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:card-answer', { selectedIndex, timeMs }), [emit]);

  // Jail
  const emitJailMath = useCallback(() => emit('game:jail-math'), [emit]);
  const emitJailAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:jail-answer', { selectedIndex, timeMs }), [emit]);
  const emitJailBail = useCallback(() => emit('game:jail-bail'), [emit]);
  const emitJailWait = useCallback(() => emit('game:jail-wait'), [emit]);

  // Level Up
  const emitLevelUp = useCallback(() => emit('game:level-up'), [emit]);
  const emitLevelUpAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:level-up-answer', { selectedIndex, timeMs }), [emit]);
  const emitLevelUpDecline = useCallback(() => emit('game:level-up-decline'), [emit]);

  // End Turn
  const emitEndTurn = useCallback(() => emit('game:end-turn'), [emit]);

  // Lobby Bot Controls
  const emitAddBot = useCallback((difficulty?: 'easy' | 'medium' | 'hard') => {
    if (!socket) return;
    socket.emit('room:add-bot', { difficulty: difficulty ?? 'medium' });
  }, [socket]);

  const emitRemoveBot = useCallback((botId: string) => {
    if (!socket) return;
    socket.emit('room:remove-bot', { botId });
  }, [socket]);

  return {
    emitRoll,
    emitDiceAnswer,
    emitBuyFull,
    emitSmartBuy,
    emitSmartBuyAnswer,
    emitSkipBuy,
    emitPayRent,
    emitRentDefense,
    emitRentDefenseAnswer,
    emitCardAck,
    emitCardAnswer,
    emitJailMath,
    emitJailAnswer,
    emitJailBail,
    emitJailWait,
    emitLevelUp,
    emitLevelUpAnswer,
    emitLevelUpDecline,
    emitEndTurn,
    emitAddBot,
    emitRemoveBot,
  };
}
