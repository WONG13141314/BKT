// Hook for Socket.IO game event listeners — MathOpoly Redesign
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
  onAnswerResult: (data: { result: AnswerResult; playerId: string }) => void;
  /** Duel opened or updated. `myChallenge` is null for onlookers and once answered. */
  onDuel: (data: { duel: PublicDuelState; myChallenge: MathChallenge | null }) => void;
  onDuelResult: (data: { duel: PublicDuelState; resolution: DuelResolution }) => void;
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

    const handleState = (data: { state: GameState }) => eventsRef.current.onStateUpdate(data.state);
    const handleChallenge = (data: { challenge: MathChallenge; playerId: string }) => eventsRef.current.onChallenge(data);
    const handleChallengeStarted = (data: { playerId: string; context: string }) => eventsRef.current.onChallengeStarted(data);
    const handleAnswerResult = (data: { result: AnswerResult; playerId: string }) => eventsRef.current.onAnswerResult(data);
    const handleDuel = (data: { duel: PublicDuelState; myChallenge: MathChallenge | null }) => eventsRef.current.onDuel(data);
    const handleDuelResult = (data: { duel: PublicDuelState; resolution: DuelResolution }) => eventsRef.current.onDuelResult(data);
    const handleFinished = (data: { scores: FinalScore[]; masteryReports: MasteryReport[] | null }) => eventsRef.current.onGameFinished(data);
    const handleBotAction = (data: { botId: string; botName: string; action: string }) => eventsRef.current.onBotAction(data);
    const handleError = (data: { message: string }) => eventsRef.current.onError(data);

    socket.on('game:state', handleState);
    socket.on('game:challenge', handleChallenge);
    socket.on('game:challenge-started', handleChallengeStarted);
    socket.on('game:answer-result', handleAnswerResult);
    socket.on('game:duel', handleDuel);
    socket.on('game:duel-result', handleDuelResult);
    socket.on('game:finished', handleFinished);
    socket.on('game:bot-action', handleBotAction);
    socket.on('game:error', handleError);

    // Subscribe before requesting state. A local server can answer in the same
    // tick, and registering afterwards occasionally left a refreshed board on
    // its loading screen until the next state change.
    socket.emit('game:request-state', { gameId });

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:challenge', handleChallenge);
      socket.off('game:challenge-started', handleChallengeStarted);
      socket.off('game:answer-result', handleAnswerResult);
      socket.off('game:duel', handleDuel);
      socket.off('game:duel-result', handleDuelResult);
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

  // Roll Challenge — the turn toll. Correct earns two dice, wrong earns one.
  const emitRollAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:roll-answer', { selectedIndex, timeMs }), [emit]);

  // Buy
  const emitBuyFull = useCallback(() => emit('game:buy-full'), [emit]);
  const emitSmartBuy = useCallback(() => emit('game:smart-buy'), [emit]);
  const emitSmartBuyAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:smart-buy-answer', { selectedIndex, timeMs }), [emit]);
  const emitSkipBuy = useCallback(() => emit('game:skip-buy'), [emit]);

  // Auctions are table-wide: every human player may bid, even when another
  // player is taking the turn.
  const emitAuctionBid = useCallback((amount: number) =>
    emit('game:auction-bid', { amount }), [emit]);

  // Math Duel — sent by either duellist. The owner answers on another player's
  // turn, so this is deliberately not gated on whose turn it is.
  const emitDuelAnswer = useCallback((selectedIndex: number, timeMs: number) =>
    emit('game:duel-answer', { selectedIndex, timeMs }), [emit]);

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

  // Request challenge re-sync
  const emitRequestChallenge = useCallback(() => emit('game:request-challenge'), [emit]);

  // End Turn
  const emitEndTurn = useCallback(() => emit('game:end-turn'), [emit]);

  // Building is a deliberate board action performed after landing events have
  // resolved. The server remains authoritative over ownership and group checks.
  const emitBuildHouse = useCallback((tileIndex: number) =>
    emit('game:build-house', { tileIndex }), [emit]);

  return {
    emitRoll,
    emitRollAnswer,
    emitBuyFull,
    emitSmartBuy,
    emitSmartBuyAnswer,
    emitSkipBuy,
    emitAuctionBid,
    emitDuelAnswer,
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
    emitBuildHouse,
    emitRequestChallenge,
  };
}
