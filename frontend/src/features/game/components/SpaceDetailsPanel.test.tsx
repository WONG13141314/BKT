import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpaceDetailsPanel } from './SpaceDetailsPanel';
import type { GameState } from '../types/game.types';

const deed = { index: 4, type: 'PROPERTY', name: 'Tolak Drive', colorGroup: 'orange', price: 120, baseRent: 50, leveledRent: 80, buildCost: 60 };

function buying(offerPrice: number, hasDiscountToken: boolean): GameState {
  return {
    turnPhase: 'BUY_DECISION', currentPlayerIndex: 0,
    players: [{ id: 'p1', hasDiscountToken }],
    tiles: Array.from({ length: 5 }, (_, index) => index === 4 ? deed : { ...deed, index, type: 'GO', name: 'Mula' }),
    properties: [{ tileIndex: 4, ownerId: null, isLeveledUp: false }],
    pendingTileEvent: { type: 'PROPERTY', tileIndex: 4, tileName: deed.name, propertyPrice: offerPrice },
  } as unknown as GameState;
}

describe('SpaceDetailsPanel purchase price', () => {
  it('shows the discount-card price the Buy button charges, not the bank offer', () => {
    render(<SpaceDetailsPanel gameState={buying(96, true)} tileIndex={4} landed />);
    expect(screen.getByText('Price with -30% card')).toBeVisible();
    expect(screen.getByText('RM84')).toBeVisible();
    expect(screen.queryByText('RM96')).not.toBeInTheDocument();
  });

  it('labels an approved bank offer, and the listed price otherwise', () => {
    const { rerender } = render(<SpaceDetailsPanel gameState={buying(96, false)} tileIndex={4} landed />);
    expect(screen.getByText('Bank offer price')).toBeVisible();
    expect(screen.getByText('RM96')).toBeVisible();
    rerender(<SpaceDetailsPanel gameState={buying(120, false)} tileIndex={4} landed />);
    expect(screen.getByText('Purchase price')).toBeVisible();
    expect(screen.getByText('RM120')).toBeVisible();
  });
});
