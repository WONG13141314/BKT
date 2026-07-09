// Hook for Socket.IO game event listeners
// Subscribes to server-broadcast game state updates

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { GameState, MathChallenge, AnswerResult, FinalScore } from '../types/game.types';

interface GameSocketEvents {
  onStateUpdate: (state: GameState) => void;
  onChallenge: (data: { challenge: MathChallenge; playerId: string }) => void;
  onChallengeStarted: (data: { playerId: string }) => void;
  onAnswerResult: (data: { result: AnswerResult; playerId: string }) => void;
  onGameFinished: (data: { scores: FinalScore[] }) => void;
  onError: (data: { message: string }) => void;
}

export function useGameSocket(gameId: string | null, events: GameSocketEvents) {
  const { socket } = useSocket();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!socket || !gameId) return;

    // Request the latest state immediately upon joining the room
    socket.emit('game:request-state', { gameId });

    const handleState = (data: { state: GameState }) => {
      eventsRef.current.onStateUpdate(data.state);
    };

    const handleChallenge = (data: { challenge: MathChallenge; playerId: string }) => {
      eventsRef.current.onChallenge(data);
    };

    const handleChallengeStarted = (data: { playerId: string }) => {
      eventsRef.current.onChallengeStarted(data);
    };

    const handleAnswerResult = (data: { result: AnswerResult; playerId: string }) => {
      eventsRef.current.onAnswerResult(data);
    };

    const handleFinished = (data: { scores: FinalScore[] }) => {
      eventsRef.current.onGameFinished(data);
    };

    const handleError = (data: { message: string }) => {
      eventsRef.current.onError(data);
    };

    socket.on('game:state', handleState);
    socket.on('game:challenge', handleChallenge);
    socket.on('game:challenge-started', handleChallengeStarted);
    socket.on('game:answer-result', handleAnswerResult);
    socket.on('game:finished', handleFinished);
    socket.on('game:error', handleError);

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:challenge', handleChallenge);
      socket.off('game:challenge-started', handleChallengeStarted);
      socket.off('game:answer-result', handleAnswerResult);
      socket.off('game:finished', handleFinished);
      socket.off('game:error', handleError);
    };
  }, [socket, gameId]);

  // ---- Emit Helpers ----

  const emitRoll = useCallback(() => {
    if (!socket || !gameId) return;
    socket.emit('game:roll', { gameId });
  }, [socket, gameId]);

  const emitAnswer = useCallback((selectedIndex: number, timeMs: number) => {
    if (!socket || !gameId) return;
    socket.emit('game:answer', { gameId, selectedIndex, timeMs });
  }, [socket, gameId]);

  const emitBuild = useCallback((tileIndex: number) => {
    if (!socket || !gameId) return;
    socket.emit('game:build', { gameId, tileIndex });
  }, [socket, gameId]);

  const emitBail = useCallback(() => {
    if (!socket || !gameId) return;
    socket.emit('game:bail', { gameId });
  }, [socket, gameId]);

  const emitEndTurn = useCallback(() => {
    if (!socket || !gameId) return;
    socket.emit('game:end-turn', { gameId });
  }, [socket, gameId]);

  return {
    emitRoll,
    emitAnswer,
    emitBuild,
    emitBail,
    emitEndTurn,
  };
}
