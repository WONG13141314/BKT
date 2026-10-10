// Hook for native WebSocket game event listeners — MathOpoly Redesign
// All new events for the redesigned turn flow

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../shared/contexts/SocketContext';
import {
  GameState,
  MathChallenge,
  AnswerResult,
  FinalScore,
  MasteryReport,
  PublicDuelState,
  DuelResolution,
} from '../types/game.types';

interface GameSocketEvents {
  onStateUpdate: (state: GameState) => void;
  onChallenge: (data: { challenge: MathChallenge; playerId: string }) => void;
  onChallengeStarted: (data: { playerId: string; context: string }) => void;
  onAnswerResult: (data: { result: AnswerResult; playerId: string; challengeId: string }) => void;
  /** Duel opened or updated. `myChallenge` is null for onlookers and once answered. */
  onDuel: (data: { duel: PublicDuelState; myChallenge: MathChallenge | null }) => void;
  onDuelResult: (data: { duel: PublicDuelState; resolution: DuelResolution }) => void;
  onDuelDismissed: (data: { duelId: string }) => void;
  onGameFinished: (data: { scores: FinalScore[]; masteryReport: MasteryReport | null }) => void;
  onBotAction: (data: { botId: string; botName: string; action: string }) => void;
  onSeatMismatch: (data: { seats: { playerId: string; name: string }[] }) => void;
  onError: (data: { message: string; code?: string }) => void;
  onConnectionRestored?: () => void;
}

export function useGameSocket(gameId: string | null, events: GameSocketEvents) {
  const { socket } = useSocket();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!socket || !gameId) return;

    const handleState = (data: { state: GameState }) => eventsRef.current.onStateUpdate(data.state);
    const handleChallenge = (data: { challenge: MathChallenge; playerId: string }) => eventsRef.current.onChallenge(data);
    const handleChallengeStarted = (data: { playerId: string; context: string }) => eventsRef.current.onChallengeStarted(data);
    const handleAnswerResult = (data: { result: AnswerResult; playerId: string; challengeId: string }) => eventsRef.current.onAnswerResult(data);
    const handleDuel = (data: { duel: PublicDuelState; myChallenge: MathChallenge | null }) => eventsRef.current.onDuel(data);
    const handleDuelResult = (data: { duel: PublicDuelState; resolution: DuelResolution }) => eventsRef.current.onDuelResult(data);
    const handleDuelDismissed = (data: { duelId: string }) => eventsRef.current.onDuelDismissed(data);
    const handleFinished = (data: { scores: FinalScore[]; masteryReport: MasteryReport | null }) => eventsRef.current.onGameFinished(data);
    const handleBotAction = (data: { botId: string; botName: string; action: string }) => eventsRef.current.onBotAction(data);
    const handleSeatMismatch = (data: { seats: { playerId: string; name: string }[] }) => eventsRef.current.onSeatMismatch(data);
    const handleError = (data: { message: string; code?: string }) => eventsRef.current.onError(data);
    const requestState = () => socket.emit('game:request-state', { gameId });
    const handleReconnect = () => {
      eventsRef.current.onConnectionRestored?.();
      requestState();
    };

    socket.on('game:state', handleState);
    socket.on('game:challenge', handleChallenge);
    socket.on('game:challenge-started', handleChallengeStarted);
    socket.on('game:answer-result', handleAnswerResult);
    socket.on('game:duel', handleDuel);
    socket.on('game:duel-result', handleDuelResult);
    socket.on('game:duel-dismissed', handleDuelDismissed);
    socket.on('game:finished', handleFinished);
    socket.on('game:bot-action', handleBotAction);
    socket.on('game:seat-mismatch', handleSeatMismatch);
    socket.on('game:error', handleError);
    socket.on('connect', handleReconnect);

    // Subscribe before requesting state. A local server can answer in the same
    // tick, and registering afterwards occasionally left a refreshed board on
    // its loading screen until the next state change.
    if (socket.connected) requestState();

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:challenge', handleChallenge);
      socket.off('game:challenge-started', handleChallengeStarted);
      socket.off('game:answer-result', handleAnswerResult);
      socket.off('game:duel', handleDuel);
      socket.off('game:duel-result', handleDuelResult);
      socket.off('game:duel-dismissed', handleDuelDismissed);
      socket.off('game:finished', handleFinished);
      socket.off('game:bot-action', handleBotAction);
      socket.off('game:seat-mismatch', handleSeatMismatch);
      socket.off('game:error', handleError);
      socket.off('connect', handleReconnect);
    };
  }, [socket, gameId]);

  // ---- Emit Helpers ----

  const emit = useCallback((event: string, data?: Record<string, any>) => {
    // Replaying an offline roll or answer after recovery could apply it to a
    // different turn or question.
    if (!socket?.connected || !gameId) return false;
    socket.emit(event, { gameId, ...data });
    return true;
  }, [socket, gameId]);

  // Roll
  const emitRoll = useCallback(() => emit('game:roll'), [emit]);
  const emitMovementComplete = useCallback((diceRollId: number) =>
    emit('game:movement-complete', { diceRollId }), [emit]);

  // Buy
  const emitBuyFull = useCallback(() => emit('game:buy-full'), [emit]);
  const emitSmartBuy = useCallback(() => emit('game:smart-buy'), [emit]);
  const emitSmartBuyAnswer = useCallback((selectedIndex: number) =>
    emit('game:smart-buy-answer', { selectedIndex }), [emit]);
  const emitSkipBuy = useCallback(() => emit('game:skip-buy'), [emit]);

  // Math Duel — sent by either duellist. The owner answers on another player's
  // turn, so this is deliberately not gated on whose turn it is.
  const emitDuelAnswer = useCallback((selectedIndex: number) =>
    emit('game:duel-answer', { selectedIndex }), [emit]);
  const emitDuelContinue = useCallback((duelId: string) =>
    emit('game:duel-continue', { duelId }), [emit]);

  // Challenge Card
  const emitCardAck = useCallback(() => emit('game:card-ack'), [emit]);
  const emitCardAnswer = useCallback((selectedIndex: number) =>
    emit('game:card-answer', { selectedIndex }), [emit]);

  // Jail
  const emitJailMath = useCallback(() => emit('game:jail-math'), [emit]);
  const emitJailAnswer = useCallback((selectedIndex: number) =>
    emit('game:jail-answer', { selectedIndex }), [emit]);
  const emitJailBail = useCallback(() => emit('game:jail-bail'), [emit]);
  const emitJailWait = useCallback(() => emit('game:jail-wait'), [emit]);

  // Request challenge re-sync
  const emitRequestChallenge = useCallback(() => emit('game:request-challenge'), [emit]);

  const emitRequestHint = useCallback((challengeId: string): Promise<void> => {
    if (!socket?.connected || !gameId) {
      return Promise.reject(new Error('Reconnect to get help. Your answer choices are still here.'));
    }
    return new Promise((resolve, reject) => {
      socket.timeout(5000).emit('game:request-hint', { gameId, challengeId }, (
        error: Error | null,
        response?: { success: boolean; error?: string },
      ) => {
        if (error) reject(new Error('Could not load help. Try again.'));
        else if (!response?.success) reject(new Error(response?.error ?? 'Could not load help. Try again.'));
        else resolve();
      });
    });
  }, [socket, gameId]);

  // End Turn
  const emitEndTurn = useCallback(() => emit('game:end-turn'), [emit]);

  // Building is a deliberate board action performed after landing events have
  // resolved. The server remains authoritative over ownership and group checks.
  const emitBuildHouse = useCallback((tileIndex: number) =>
    emit('game:build-house', { tileIndex }), [emit]);

  return {
    emitRoll,
    emitMovementComplete,
    emitBuyFull,
    emitSmartBuy,
    emitSmartBuyAnswer,
    emitSkipBuy,
    emitDuelAnswer,
    emitDuelContinue,
    emitCardAck,
    emitCardAnswer,
    emitJailMath,
    emitJailAnswer,
    emitJailBail,
    emitJailWait,
    emitEndTurn,
    emitBuildHouse,
    emitRequestChallenge,
    emitRequestHint,
  };
}
