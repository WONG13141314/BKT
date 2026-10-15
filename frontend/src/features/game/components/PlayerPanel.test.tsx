import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerPanel } from './PlayerPanel';

describe('PlayerPanel', () => {
  it('warns that the clock cap has started the final round', () => {
    render(<PlayerPanel players={[]} currentPlayerIndex={0} myPlayerId="p1" round={6} maxRounds={12} isFinalRound />);
    expect(screen.getByRole('status')).toHaveTextContent(/final round/i);
  });

  it('shows no final-round warning before the clock cap', () => {
    render(<PlayerPanel players={[]} currentPlayerIndex={0} myPlayerId="p1" round={6} maxRounds={12} />);
    expect(screen.queryByText(/final round/i)).not.toBeInTheDocument();
  });
});
