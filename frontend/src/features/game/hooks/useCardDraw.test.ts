import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_DRAW_MS, DRAW_FALLBACK_MS, useCardDraw, WATCH_DRAW_MS } from './useCardDraw';
import type { ChallengeCard } from '../types/game.types';

const card: ChallengeCard = { id: 1, name: 'Duit Raya!', description: 'RM80', isMathCard: false, effect: { type: 'NOTHING' } };

describe('useCardDraw', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for the drawer to pick, then shows the card where the board says it rose', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardDraw(card, 'draw-1', true));
    expect(result.current.stage).toBe('ready');
    expect(result.current.tableDraw?.onPick).toBeDefined();

    act(() => result.current.pick());
    expect(result.current.stage).toBe('drawing');
    act(() => result.current.tableDraw!.onDrawn({ x: 120, y: 340 }));
    expect(result.current.stage).toBe('shown');
    expect(result.current.origin).toEqual({ x: 120, y: 340 });
  });

  it('draws by itself for an idle drawer, and for onlookers soon after the camera arrives', () => {
    vi.useFakeTimers();
    const drawer = renderHook(() => useCardDraw(card, 'draw-1', true));
    act(() => { vi.advanceTimersByTime(AUTO_DRAW_MS); });
    expect(drawer.result.current.stage).toBe('drawing');

    const onlooker = renderHook(() => useCardDraw(card, 'draw-1', false));
    expect(onlooker.result.current.tableDraw?.onPick).toBeUndefined();
    act(() => { vi.advanceTimersByTime(WATCH_DRAW_MS); });
    expect(onlooker.result.current.stage).toBe('drawing');
  });

  it('shows the card even if the board never reports it arriving', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardDraw(card, 'draw-1', true));
    act(() => result.current.pick());
    act(() => { vi.advanceTimersByTime(DRAW_FALLBACK_MS); });
    expect(result.current.stage).toBe('shown');
    expect(result.current.origin).toBeNull();
  });

  it('starts again for the next card and stops when no card is on the deck', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ key }) => useCardDraw(key ? card : null, key, true), {
      initialProps: { key: 'draw-1' as string | null },
    });
    act(() => result.current.pick());
    rerender({ key: 'draw-2' });
    expect(result.current.stage).toBe('ready');
    rerender({ key: null });
    expect(result.current.stage).toBeNull();
    expect(result.current.tableDraw).toBeNull();
  });
});
