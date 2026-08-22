import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChallengeDialog } from './ChallengeDialog';
import { ChallengeTimer } from './ChallengeTimer';

describe('ChallengeDialog', () => {
  it('is modal and moves focus to the first action', () => {
    render(<ChallengeDialog title="Math challenge"><button>Answer one</button></ChallengeDialog>);
    expect(screen.getByRole('dialog', { name: /math challenge/i })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /answer one/i })).toHaveFocus();
  });

  it('shows numeric time and the final-five warning', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(15_000));
    render(<ChallengeTimer expiresAt={20_000} totalSeconds={20} />);
    expect(screen.getByRole('timer')).toHaveTextContent('5 seconds');
    expect(screen.getByRole('timer')).toHaveClass('challenge-timer--critical');
    vi.useRealTimers();
  });
});
