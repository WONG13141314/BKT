import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAW_DELAY_MS, DRAW_FALLBACK_MS, useCardDraw } from './useCardDraw';
import type { ChallengeCard } from '../types/game.types';

const card: ChallengeCard = { id: 1, name: 'Duit Raya!', description: 'RM80', isMathCard: false, effect: { type: 'NOTHING' } };

describe('useCardDraw', () => {
  afterEach(() => vi.useRealTimers());

  it('draws by itself once the camera arrives, then shows the card where the board says it rose', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardDraw(card, 'draw-1'));
    expect(result.current.stage).toBe('ready');

    act(() => { vi.advanceTimersByTime(DRAW_DELAY_MS - 1); });
    expect(result.current.stage).toBe('ready');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.stage).toBe('drawing');

    act(() => result.current.tableDraw!.onDrawn({ x: 120, y: 340 }));
    expect(result.current.stage).toBe('shown');
    expect(result.current.origin).toEqual({ x: 120, y: 340 });
  });

  it('shows the card even if the board never reports it arriving', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardDraw(card, 'draw-1'));
    act(() => { vi.advanceTimersByTime(DRAW_DELAY_MS); });
    act(() => { vi.advanceTimersByTime(DRAW_FALLBACK_MS); });
    expect(result.current.stage).toBe('shown');
    expect(result.current.origin).toBeNull();
  });

  it('starts again for the next card and stops when no card is on the deck', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ key }) => useCardDraw(key ? card : null, key), {
      initialProps: { key: 'draw-1' as string | null },
    });
    act(() => { vi.advanceTimersByTime(DRAW_DELAY_MS); });
    expect(result.current.stage).toBe('drawing');
    rerender({ key: 'draw-2' });
    expect(result.current.stage).toBe('ready');
    rerender({ key: null });
    expect(result.current.stage).toBeNull();
    expect(result.current.tableDraw).toBeNull();
  });
});
