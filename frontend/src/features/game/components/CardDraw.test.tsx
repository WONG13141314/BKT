import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardDraw } from './CardDraw';
import type { ChallengeCard } from '../types/game.types';

const mathCard: ChallengeCard = {
  id: 8, name: 'Bonus Besar!', description: 'Answer correctly for a BIG bonus!', isMathCard: true, effect: { type: 'NOTHING' },
};

describe('CardDraw', () => {
  afterEach(() => vi.useRealTimers());

  it('lets the drawer pick the card, turns it over, then asks to solve it', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<CardDraw card={mathCard} drawerName="You" isDrawer reducedMotion={false} onDone={onDone} />);

    expect(screen.getByText('Tap the deck to draw a card')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Draw the top Challenge Card' }));
    expect(screen.queryByRole('button', { name: 'Solve it' })).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Solve it' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('draws for onlookers on its own and gives them nothing to press', () => {
    vi.useFakeTimers();
    render(<CardDraw card={{ ...mathCard, isMathCard: false, name: 'Oops!' }} drawerName="Bot Ali" isDrawer={false} reducedMotion={false} onDone={vi.fn()} />);

    expect(screen.getByText('Bot Ali is drawing a card…')).toBeVisible();
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText('Bot Ali drew “Oops!”')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('draws the card for an idle drawer so the turn never stalls', () => {
    vi.useFakeTimers();
    render(<CardDraw card={{ ...mathCard, isMathCard: false }} drawerName="You" isDrawer reducedMotion={false} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(6_000); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByRole('button', { name: 'OK' })).toBeVisible();
  });
});
