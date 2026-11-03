import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardReveal } from './CardReveal';
import type { ChallengeCard } from '../types/game.types';

const mathCard: ChallengeCard = {
  id: 8, name: 'Bonus Besar!', description: 'Answer correctly for a BIG bonus!', isMathCard: true, effect: { type: 'NOTHING' },
};

describe('CardReveal', () => {
  it('lets the drawer carry out a math card', () => {
    const onDone = vi.fn();
    render(<CardReveal card={mathCard} drawerName="You" isDrawer onDone={onDone} />);
    expect(screen.getByRole('heading', { name: 'Bonus Besar!' })).toBeVisible();
    expect(screen.getByText('A question follows')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Solve it' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('shows onlookers who drew the card, with nothing to press', () => {
    render(<CardReveal card={{ ...mathCard, isMathCard: false, name: 'Oops!' }} drawerName="Bot Ali" isDrawer={false} onDone={vi.fn()} />);
    expect(screen.getByText('Bot Ali drew this card')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
