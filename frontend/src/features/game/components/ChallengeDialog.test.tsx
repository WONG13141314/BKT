import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChallengeDialog } from './ChallengeDialog';
import { ChallengeTimer } from './ChallengeTimer';

describe('ChallengeDialog', () => {
  it('is modal and moves focus to the first action', () => {
    render(<ChallengeDialog title="Math challenge"><button>Answer one</button></ChallengeDialog>);
    expect(screen.getByRole('dialog', { name: /math challenge/i })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /answer one/i })).toHaveFocus();
    expect(screen.queryByText(/primary math/i)).not.toBeInTheDocument();
  });

  it('shows numeric time and the final-five warning', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(15_000));
    render(<ChallengeTimer expiresAt={20_000} totalSeconds={20} />);
    expect(screen.getByRole('timer')).toHaveTextContent('5 seconds');
    expect(screen.getByRole('timer')).toHaveClass('challenge-timer--critical');
    vi.useRealTimers();
  });

  it('uses a newly issued deadline immediately, including after a paused answer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { rerender } = render(<ChallengeTimer expiresAt={15_000} totalSeconds={45} paused />);
    expect(screen.getByRole('timer')).toHaveTextContent('5 seconds');
    rerender(<ChallengeTimer expiresAt={70_000} totalSeconds={60} />);
    expect(screen.getByRole('timer')).toHaveTextContent('60 seconds');
    vi.useRealTimers();
  });
});
