import { useCallback, useEffect, useRef } from 'react';

/** Keeps an answered question visible briefly without letting it cover the next one. */
export function useAnswerResultHold() {
  const visibleChallengeIdRef = useRef<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = null;
  }, []);

  useEffect(() => cancelPendingClear, [cancelPendingClear]);

  const markChallengeVisible = useCallback((challengeId: string) => {
    // A private hint or reconnect refresh is still the same visible question.
    if (visibleChallengeIdRef.current === challengeId) return;
    cancelPendingClear();
    visibleChallengeIdRef.current = challengeId;
  }, [cancelPendingClear]);

  const holdThenClear = useCallback((
    fallbackChallengeId: string | null,
    delayMs: number,
    onClear: (answeredChallengeId: string | null) => void,
  ) => {
    const answeredChallengeId = fallbackChallengeId ?? visibleChallengeIdRef.current;
    if (answeredChallengeId && visibleChallengeIdRef.current
      && visibleChallengeIdRef.current !== answeredChallengeId) return;
    cancelPendingClear();

    clearTimerRef.current = setTimeout(() => {
      // A new question took over while this result was visible.
      if (answeredChallengeId && visibleChallengeIdRef.current !== answeredChallengeId) return;
      visibleChallengeIdRef.current = null;
      clearTimerRef.current = null;
      onClear(answeredChallengeId);
    }, delayMs);
  }, [cancelPendingClear]);

  const clearVisible = useCallback(() => {
    cancelPendingClear();
    visibleChallengeIdRef.current = null;
  }, [cancelPendingClear]);

  return { markChallengeVisible, holdThenClear, clearVisible };
}
