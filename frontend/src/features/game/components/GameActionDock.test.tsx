import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameActionDock } from './GameActionDock';
import type { GameState } from '../types/game.types';

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
});
