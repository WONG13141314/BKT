import { ArrowRight, Banknote, DollarSign, House, Hourglass, Lock, Zap } from 'lucide-react';
import type { GameState, Player } from '../types/game.types';
import { formatRM } from '../types/game.types';
import './GameActionDock.css';

export interface GameActionDockProps {
  state: GameState;
  currentPlayer: Player | null;
  isMyTurn: boolean;
  selectedTile: number;
  isBoardAnimating: boolean;
  isHoldingDuelResult: boolean;
  onRoll(): void;
  onBuyFull(): void;
  onSmartBuy(): void;
  onSkipBuy(): void;
  onJailMath(): void;
  onJailBail(): void;
  onJailWait(): void;
  onBuild(tileIndex: number): void;
  onEndTurn(): void;
}

export function GameActionDock({
  state,
  currentPlayer,
  isMyTurn,
  selectedTile,
  isBoardAnimating,
  isHoldingDuelResult,
  onRoll,
  onBuyFull,
  onSmartBuy,
  onSkipBuy,
  onJailMath,
  onJailBail,
  onJailWait,
  onBuild,
  onEndTurn,
}: GameActionDockProps) {
  if (!isMyTurn || isBoardAnimating) return null;

  const phase = state.turnPhase;
  const pending = state.pendingTileEvent;
  const selected = state.tiles[selectedTile];
  const selectedProperty = state.properties.find((property) => property.tileIndex === selectedTile);
  const groupTiles = selected?.colorGroup
    ? state.tiles.filter((tile) => tile.colorGroup === selected.colorGroup).map((tile) => tile.index)
    : [];
  const ownsGroup = !!currentPlayer && groupTiles.length > 0 && groupTiles.every((tileIndex) =>
    state.properties.find((property) => property.tileIndex === tileIndex)?.ownerId === currentPlayer.id
  );
  const canBuild = phase === 'END_TURN'
    && selected?.type === 'PROPERTY'
    && selectedProperty?.ownerId === currentPlayer?.id
    && selectedProperty?.isLeveledUp === false
    && ownsGroup
    && !!currentPlayer
    && (currentPlayer.hasLevelUpToken || currentPlayer.money >= selected.buildCost);

  if (phase === 'ROLL_PHASE') {
    return (
      <div className="game-action-dock" id="game-actions" aria-label="Game actions">
        <button className="action-btn action-btn--primary" onClick={onRoll}>Roll Dice</button>
      </div>
    );
  }

  if (phase === 'BUY_DECISION' && pending) {
    const listedPrice = pending.propertyPrice ?? 0;
    const price = currentPlayer?.hasDiscountToken ? Math.floor(listedPrice * 0.7) : listedPrice;
    return (
      <div className="game-action-dock game-action-dock--decision" id="game-actions" aria-label="Property actions">
        {!pending.bankOfferAttempted && (
          <button className="action-btn action-btn--primary" onClick={onSmartBuy}>
            <Zap size={17} aria-hidden="true" /> Answer for Bank Offer
          </button>
        )}
        <button
          className="action-btn action-btn--secondary"
          onClick={onBuyFull}
          disabled={(currentPlayer?.money ?? 0) < price}
        >
          <DollarSign size={17} aria-hidden="true" />
          {pending.bankOfferApproved ? 'Accept Offer' : 'Buy Property'} · {formatRM(price)}
        </button>
        <button className="action-btn action-btn--ghost" onClick={onSkipBuy}>Skip Purchase</button>
      </div>
    );
  }

  if (phase === 'JAIL_DECISION') {
    return (
      <div className="game-action-dock game-action-dock--decision" id="game-actions" aria-label="Jail actions">
        <span className="game-action-dock__label"><Lock size={16} aria-hidden="true" /> Choose an escape</span>
        <button className="action-btn action-btn--primary" onClick={onJailMath}>Math Escape</button>
        <button className="action-btn action-btn--secondary" onClick={onJailBail}>
          <Banknote size={17} aria-hidden="true" /> Pay Bail ({formatRM(50)})
        </button>
        <button className="action-btn action-btn--ghost" onClick={onJailWait}>
          <Hourglass size={17} aria-hidden="true" /> Wait
        </button>
      </div>
    );
  }

  if (phase === 'END_TURN') {
    return (
      <div className="game-action-dock" id="game-actions" aria-label="End turn actions">
        {canBuild && (
          <button className="action-btn action-btn--secondary" onClick={() => onBuild(selectedTile)}>
            <House size={17} aria-hidden="true" />
            Build House ({currentPlayer?.hasLevelUpToken ? 'Free token' : formatRM(selected.buildCost)})
          </button>
        )}
        <button className="action-btn action-btn--end" onClick={onEndTurn} disabled={isHoldingDuelResult}>
          {isHoldingDuelResult ? 'Showing Result…' : 'End Turn'} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
}
