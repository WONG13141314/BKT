import { useCallback, useRef, useState } from 'react';
import type { SoundEffect } from '../../../shared/audio/audio-engine';
import type { AnswerResult, GameState, MathChallenge, PublicDuelState } from '../types/game.types';
import type { GameSocketEvents } from './useGameSocket';
import { useAnswerResultHold } from './useAnswerResultHold';

type EventData<K extends keyof GameSocketEvents> = Parameters<NonNullable<GameSocketEvents[K]>>[0];

/** Answer and duel cards stay readable this long unless the learner continues. */
const RESULT_HOLD_MS = 6000;

/**
 * The learner's question card and the table's Math Duel card. Each question
 * and duel is tracked by ID, so a late result, hint refresh or dismissal can
 * never open, replace or close a newer one.
 */
export function useQuestionCards({ setAnswerResult, playSound }: {
  setAnswerResult: (result: AnswerResult | null) => void;
  playSound: (sound: SoundEffect) => void;
}) {
  const [activeChallenge, setActiveChallenge] = useState<MathChallenge | null>(null);
  // Duel state is separate from `gameState`: it is redacted per recipient, so it
  // arrives on its own channel rather than inside the shared state broadcast.
  const [duel, setDuel] = useState<PublicDuelState | null>(null);
  const [duelChallenge, setDuelChallenge] = useState<MathChallenge | null>(null);
  const [duelAnswerResult, setDuelAnswerResult] = useState<AnswerResult | null>(null);
  const [questionRecoveryRevision, setQuestionRecoveryRevision] = useState(0);
  const activeChallengeIdRef = useRef<string | null>(null);
  const duelChallengeIdRef = useRef<string | null>(null);
  const duelIdRef = useRef<string | null>(null);
  const duelAnswerResultRef = useRef<AnswerResult | null>(null);
  const pendingDuelChallengeIdRef = useRef<string | null>(null);
  const completedChallengeIdsRef = useRef(new Set<string>());
  const { markChallengeVisible, holdThenClear, clearVisible } = useAnswerResultHold();
  const {
    markChallengeVisible: markDuelVisible,
    holdThenClear: holdDuelThenClear,
    clearVisible: clearDuelVisible,
  } = useAnswerResultHold();

  const dismissAnswerResult = useCallback(() => {
    clearVisible();
    activeChallengeIdRef.current = null;
    setActiveChallenge(null);
    setAnswerResult(null);
  }, [clearVisible, setAnswerResult]);

  const dismissDuelResult = useCallback(() => {
    clearDuelVisible();
    duelIdRef.current = null;
    duelChallengeIdRef.current = null;
    duelAnswerResultRef.current = null;
    pendingDuelChallengeIdRef.current = null;
    setDuel(null);
    setDuelChallenge(null);
    setDuelAnswerResult(null);
  }, [clearDuelVisible]);

  const rememberCompletedChallenge = useCallback((challengeId: string) => {
    const completed = completedChallengeIdsRef.current;
    completed.add(challengeId);
    if (completed.size > 64) completed.delete(completed.values().next().value!);
  }, []);

  /** Follows a state broadcast: a recovered question, or a turn that moved past the duel. */
  function syncWithState(state: GameState, previous: GameState | null) {
    if (state.currentChallenge) {
      if (!completedChallengeIdsRef.current.has(state.currentChallenge.id)) {
        if (activeChallengeIdRef.current !== state.currentChallenge.id) setAnswerResult(null);
        activeChallengeIdRef.current = state.currentChallenge.id;
        markChallengeVisible(state.currentChallenge.id);
        setActiveChallenge(state.currentChallenge);
      }
    }
    // The server has moved past the duel — clear it if it's still unresolved,
    // but let it linger if we are showing the resolution result.
    if (state.turnPhase !== 'MATH_DUEL') {
      setDuel(prev => prev?.resolution ? prev : null);
      setDuelChallenge(null);
    }
    if (state.players[state.currentPlayerIndex]?.id !== previous?.players[previous.currentPlayerIndex]?.id
      || state.turnPhase === 'ROLL_PHASE' || state.turnPhase === 'MOVING') {
      dismissDuelResult();
    }
  }

  function onChallenge(data: EventData<'onChallenge'>) {
    if (completedChallengeIdsRef.current.has(data.challenge.id)) return;
    // Help refreshes only the requesting player's existing question. A duel
    // stays open and the other side never receives this private cue.
    if (data.challenge.context === 'MATH_DUEL') {
      if (pendingDuelChallengeIdRef.current === data.challenge.id) return;
      duelChallengeIdRef.current = data.challenge.id;
      setDuelChallenge(data.challenge);
      return;
    }
    if (activeChallengeIdRef.current !== data.challenge.id) {
      markChallengeVisible(data.challenge.id);
      setAnswerResult(null);
    }
    activeChallengeIdRef.current = data.challenge.id;
    setActiveChallenge(data.challenge);
    // The duel reveal lingers deliberately so the table can read it, but the
    // server has already advanced the turn. Drop it the moment the next
    // question arrives, or it would cover the new player's challenge.
    dismissDuelResult();
  }

  /** Only this learner's own results arrive here; onlookers get outcome-only events. */
  function onMyAnswerResult(data: EventData<'onAnswerResult'>) {
    // Each result belongs to an issued question, including an owner's duel
    // answer on another player's turn. Late results cannot replace a new one.
    if (data.challengeId === duelChallengeIdRef.current) {
      pendingDuelChallengeIdRef.current = null;
      rememberCompletedChallenge(data.challengeId);
      duelAnswerResultRef.current = data.result;
      setDuelAnswerResult(data.result);
      return;
    }
    if (data.challengeId !== activeChallengeIdRef.current) return;
    rememberCompletedChallenge(data.challengeId);
    setAnswerResult(data.result);
    playSound(data.result.isCorrect ? 'correct' : 'incorrect');
    // One primary card gives time to read, with an earlier Continue action.
    holdThenClear(data.challengeId, RESULT_HOLD_MS, (answeredId) => {
      if (activeChallengeIdRef.current === answeredId) dismissAnswerResult();
    });
  }

  function onDuel(data: EventData<'onDuel'>) {
    // Ignore re-sent resolved duels — they've already been handled by
    // onDuelResult and would re-show the card after the timeout cleared it.
    if (data.duel.resolution) return;
    if (duelIdRef.current !== data.duel.id) {
      dismissAnswerResult();
      markDuelVisible(data.duel.id);
      duelIdRef.current = data.duel.id;
      duelAnswerResultRef.current = null;
      setDuelAnswerResult(null);
      duelChallengeIdRef.current = data.myChallenge?.id ?? null;
      pendingDuelChallengeIdRef.current = null;
    }
    if (data.myChallenge) duelChallengeIdRef.current = data.myChallenge.id;
    setDuel(data.duel);
    setDuelChallenge(data.myChallenge && !completedChallengeIdsRef.current.has(data.myChallenge.id)
      && pendingDuelChallengeIdRef.current !== data.myChallenge.id
      ? data.myChallenge : null);
  }

  function onDuelResult(data: EventData<'onDuelResult'>) {
    if (duelIdRef.current !== data.duel.id) return;
    setDuel(data.duel);
    setDuelChallenge(null);
    playSound(duelAnswerResultRef.current?.isCorrect === false ? 'incorrect' : 'correct');
    holdDuelThenClear(data.duel.id, RESULT_HOLD_MS, (answeredDuelId) => {
      if (duelIdRef.current === answeredDuelId) dismissDuelResult();
    });
  }

  function onDuelDismissed(data: EventData<'onDuelDismissed'>) {
    if (data.duelId === duelIdRef.current) dismissDuelResult();
  }

  /** The duel answer was sent: lock this question until its result arrives. */
  function markDuelAnswerSent() {
    pendingDuelChallengeIdRef.current = duelChallengeIdRef.current;
    setDuelChallenge(null);
  }

  /**
   * A click can leave the browser without ever reaching the server. The
   * recovery snapshot decides whether it was accepted; remount unanswered
   * controls so a local pending selection cannot lock the restored question.
   */
  function resetAfterReconnect() {
    pendingDuelChallengeIdRef.current = null;
    activeChallengeIdRef.current = null;
    setActiveChallenge(null);
    setAnswerResult(null);
    setDuelChallenge(null);
    setQuestionRecoveryRevision(revision => revision + 1);
  }

  return {
    activeChallenge,
    duel,
    duelChallenge,
    duelAnswerResult,
    questionRecoveryRevision,
    dismissAnswerResult,
    dismissDuelResult,
    syncWithState,
    onChallenge,
    onMyAnswerResult,
    onDuel,
    onDuelResult,
    onDuelDismissed,
    markDuelAnswerSent,
    resetAfterReconnect,
  };
}
