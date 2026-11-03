import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getTurnStatus, TurnIndicator } from './TurnIndicator';
import type { Player } from '../types/game.types';

const base = { routeLabel: null, moving: false, spaceName: 'Penjara', pendingTileEvent: null };

describe('getTurnStatus', () => {
  it('folds the jail space into one line instead of a second banner', () => {
    expect(getTurnStatus({ ...base, isMyTurn: true, turnPhase: 'JAIL_DECISION', routeLabel: 'In Penjara' }))
      .toBe('In Penjara · choose how to leave');
    expect(getTurnStatus({ ...base, isMyTurn: false, turnPhase: 'JAIL_DECISION' }))
      .toBe('In Penjara · deciding how to leave');
  });

  it('tells onlookers what the active player is doing', () => {
    const offer = { type: 'PROPERTY', tileIndex: 1, tileName: 'Tolak Lane' } as const;
    expect(getTurnStatus({ ...base, isMyTurn: false, turnPhase: 'SMART_BUY_CHALLENGE', pendingTileEvent: offer }))
      .toBe('Answering for a bank offer on Tolak Lane');
    expect(getTurnStatus({ ...base, isMyTurn: false, turnPhase: 'CARD_DRAW' })).toBe('Drawing a Challenge Card');
  });

  it('shows the walk while the piece moves', () => {
    expect(getTurnStatus({ ...base, isMyTurn: false, turnPhase: 'MOVING', moving: true, routeLabel: 'Tolak Lane · 2 of 6' }))
      .toBe('Moving · Tolak Lane · 2 of 6');
  });
});

describe('TurnIndicator', () => {
  const player = { id: 'b', name: 'Mei', color: '#2a9d8f', tokenType: 'cat' } as unknown as Player;

  it('gives onlookers a countdown, and swaps it for a verdict when one arrives', () => {
    const props = { ...base, currentPlayer: player, isMyTurn: false, turnPhase: 'CARD_MATH_CHALLENGE', secondsLeft: 24, flash: null };
    const { rerender } = render(<TurnIndicator {...props} />);
    expect(screen.getByText("Mei's Turn")).toBeVisible();
    expect(screen.getByText('24s')).toBeVisible();

    rerender(<TurnIndicator {...props} flash={{ id: 1, tone: 'good', text: 'Correct!' }} />);
    expect(screen.getByText('Correct!')).toBeVisible();
    expect(screen.queryByText('24s')).not.toBeInTheDocument();
  });

  it('shows no countdown on your own turn, where the dock already does', () => {
    render(<TurnIndicator {...base} currentPlayer={player} isMyTurn turnPhase="ROLL_PHASE" secondsLeft={30} flash={null} />);
    expect(screen.getByText('Your Turn')).toBeVisible();
    expect(screen.queryByText('30s')).not.toBeInTheDocument();
  });
});
