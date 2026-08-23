import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnswerResultHold } from './useAnswerResultHold';

describe('useAnswerResultHold', () => {
  afterEach(() => vi.useRealTimers());

  it('clears an answered challenge even after the server advances the phase', () => {
    vi.useFakeTimers();
    const clear = vi.fn();
    const { result } = renderHook(() => useAnswerResultHold());

    act(() => result.current.markChallengeVisible('challenge-1'));
    act(() => result.current.holdThenClear('challenge-1', 900, clear));
    act(() => vi.advanceTimersByTime(900));

    expect(clear).toHaveBeenCalledWith('challenge-1');
  });

  it('never lets an old result timer close a newer challenge', () => {
    vi.useFakeTimers();
    const clear = vi.fn();
    const { result } = renderHook(() => useAnswerResultHold());

    act(() => result.current.markChallengeVisible('challenge-1'));
    act(() => result.current.holdThenClear('challenge-1', 900, clear));
    act(() => result.current.markChallengeVisible('challenge-2'));
    act(() => vi.advanceTimersByTime(900));

    expect(clear).not.toHaveBeenCalled();
  });
});
