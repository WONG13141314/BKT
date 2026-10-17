import type { GameState, Player } from '../types/game.types';

/** Matches the server's DISCOUNT_TOKEN_RATE (30% off the listed price). */
const DISCOUNT_CARD_RATE = 0.3;

export type PurchasePriceSource = 'listed' | 'bankOffer' | 'discountCard';

/**
 * The price the active player would pay for the deed being decided, mirroring
 * the server: discounts never stack, and the discount card applies to the
 * listed price only when it beats the price already on offer.
 */
export function purchaseQuote(
  state: GameState,
  buyer: Pick<Player, 'hasDiscountToken'> | null = state.players[state.currentPlayerIndex] ?? null,
): { price: number; source: PurchasePriceSource } | null {
  const pending = state.pendingTileEvent;
  if (state.turnPhase !== 'BUY_DECISION' || !pending || typeof pending.propertyPrice !== 'number') return null;
  const listed = state.tiles[pending.tileIndex]?.price ?? pending.propertyPrice;
  const offer = pending.propertyPrice;
  const cardPrice = Math.floor(listed * (1 - DISCOUNT_CARD_RATE));
  if (buyer?.hasDiscountToken && cardPrice < offer) return { price: cardPrice, source: 'discountCard' };
  return { price: offer, source: offer < listed ? 'bankOffer' : 'listed' };
}
