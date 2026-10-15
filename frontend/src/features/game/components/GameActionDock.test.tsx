import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameActionDock } from './GameActionDock';
import type { GameState, Player } from '../types/game.types';

const state = {
  turnPhase: 'ROLL_PHASE',
  pendingTileEvent: null,
  tiles: [{ index: 0, type: 'GO', name: 'Mula', colorGroup: null, skillTheme: null, price: 0, baseRent: 0, leveledRent: 0, buildCost: 0 }],
  properties: [],
} as unknown as GameState;

const callbacks = {
  onRoll: vi.fn(), onBuyFull: vi.fn(), onSmartBuy: vi.fn(), onSkipBuy: vi.fn(),
  onJailMath: vi.fn(), onJailBail: vi.fn(), onJailWait: vi.fn(), onBuild: vi.fn(),
  onCardAck: vi.fn(), onEndTurn: vi.fn(),
};

describe('GameActionDock', () => {
  it('renders only Roll during the roll phase', () => {
    render(<GameActionDock state={state} currentPlayer={null} isMyTurn selectedTile={0}
      isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);
    expect(screen.getByRole('button', { name: /roll dice/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /buy property/i })).not.toBeInTheDocument();
  });

  it('renders nothing during movement presentation', () => {
    const { container } = render(<GameActionDock state={{ ...state, turnPhase: 'MOVING' }} currentPlayer={null}
      isMyTurn selectedTile={0} isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers jail escape choices immediately and starts maths without a roll click', () => {
    render(<GameActionDock state={{ ...state, turnPhase: 'JAIL_DECISION' }} currentPlayer={null}
      isMyTurn selectedTile={0} isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay bail/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wait' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Math Escape' }));
    expect(callbacks.onJailMath).toHaveBeenCalledOnce();
    expect(callbacks.onRoll).not.toHaveBeenCalled();
  });

  afterEach(() => vi.useRealTimers());

  it('disables Pay Bail when the jailed player cannot afford it', () => {
    const broke = { id: 'p1', money: 49 } as Player;
    render(<GameActionDock state={{ ...state, turnPhase: 'JAIL_DECISION' }} currentPlayer={broke}
      isMyTurn selectedTile={0} isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);
    expect(screen.getByRole('button', { name: /pay bail/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Math Escape' })).toBeEnabled();
  });

  it('counts down to the server default action using the server clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    // This device's clock is ten minutes behind the server.
    const serverNow = 1_600_000;
    const buying = {
      ...state, turnPhase: 'BUY_DECISION', phaseDeadline: serverNow + 12_000, serverNow,
      pendingTileEvent: { type: 'PROPERTY', tileIndex: 0, tileName: 'Mula', propertyPrice: 80, propertyOwner: null },
    } as unknown as GameState;
    render(<GameActionDock state={buying} currentPlayer={{ id: 'p1', money: 800 } as Player}
      isMyTurn selectedTile={0} isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);

    expect(screen.getByRole('timer')).toHaveTextContent('Skips the purchase in 12s');
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(screen.getByRole('timer')).toHaveTextContent('Skips the purchase in 4s');
  });

  it('shows no countdown when the phase has no deadline', () => {
    render(<GameActionDock state={{ ...state, phaseDeadline: null }} currentPlayer={null}
      isMyTurn selectedTile={0} isBoardAnimating={false} isHoldingDuelResult={false} {...callbacks} />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});
