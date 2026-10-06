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

  it('keeps the original reading hold when the same question is refreshed', () => {
    vi.useFakeTimers();
    const clear = vi.fn();
    const { result } = renderHook(() => useAnswerResultHold());
    act(() => result.current.markChallengeVisible('question-1'));
    act(() => result.current.holdThenClear('question-1', 6000, clear));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.markChallengeVisible('question-1'));
    act(() => vi.advanceTimersByTime(4000));
    expect(clear).toHaveBeenCalledWith('question-1');
  });

  it('ignores a late result for an earlier duel without disturbing the current hold', () => {
    vi.useFakeTimers();
    const oldClear = vi.fn();
    const currentClear = vi.fn();
    const { result } = renderHook(() => useAnswerResultHold());
    act(() => result.current.markChallengeVisible('duel-2'));
    act(() => result.current.holdThenClear('duel-2', 6000, currentClear));
    act(() => result.current.holdThenClear('duel-1', 6000, oldClear));
    act(() => vi.advanceTimersByTime(6000));
    expect(oldClear).not.toHaveBeenCalled();
    expect(currentClear).toHaveBeenCalledWith('duel-2');
  });
});
