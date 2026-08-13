import { ReactNode } from 'react';
import { GameState, formatRM } from '../types/game.types';
import { BOARD_TILES, COLOR_GROUPS } from '../config/board.config';
import './SpaceDetailsPanel.css';

const SPECIAL_COPY: Record<string, string> = {
  GO: 'Pass Mula to collect RM150 from the bank.',
  CHALLENGE_CARD: 'Draw a Monopoly-style event card. Some cards contain an adaptive mathematics challenge.',
  JAIL: 'Choose Math Escape, pay RM50 bail, or wait for release.',
  GO_TO_JAIL: 'Move directly to Penjara. Do not collect salary.',
  LUCKY_BREAK: 'Receive cash or a free house token from the bank.',
  TAX: 'Pay the displayed amount to the bank.',
  REST: 'A quiet space. No payment is required.',
};

interface Props {
  gameState: GameState;
  tileIndex: number;
  landed: boolean;
  children?: ReactNode;
}

export function SpaceDetailsPanel({ gameState, tileIndex, landed, children }: Props) {
  const tile = BOARD_TILES[tileIndex] ?? BOARD_TILES[0];
  const property = gameState.properties.find((item) => item.tileIndex === tile.index);
  const owner = property?.ownerId ? gameState.players.find((player) => player.id === property.ownerId) : null;
  const group = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] : null;
  const currentRent = property?.isLeveledUp ? tile.leveledRent : tile.baseRent;
  const isProperty = tile.type === 'PROPERTY';
  const liveOffer = gameState.pendingTileEvent?.tileIndex === tile.index
    && gameState.turnPhase === 'BUY_DECISION'
    ? gameState.pendingTileEvent.propertyPrice
    : null;

  return (
    <aside className={`space-details ${isProperty ? 'space-details--property' : 'space-details--event'}`}>
      <div className="space-details__ribbon">{landed ? 'LANDED HERE' : 'SPACE DETAILS'}</div>
      <header className="space-details__header" style={{ '--deed-color': group?.color ?? '#e0aaff' } as React.CSSProperties}>
        <small>{isProperty ? 'TITLE DEED' : tile.type.replace(/_/g, ' ')}</small>
        <h2>{tile.name}</h2>
        {isProperty && <span>{owner ? `Owned by ${owner.name}` : 'Unowned property'}</span>}
      </header>

      <div className="space-details__body">
        {isProperty ? (
          <>
            <dl className="space-details__facts">
              <div>
                <dt>{liveOffer != null && liveOffer !== tile.price ? 'Current bank offer' : 'Purchase price'}</dt>
                <dd>{formatRM(liveOffer ?? tile.price)}</dd>
              </div>
              <div><dt>Current rent</dt><dd>{formatRM(currentRent)}</dd></div>
              <div><dt>Rent with house</dt><dd>{formatRM(tile.leveledRent)}</dd></div>
              <div><dt>Build house cost</dt><dd>{formatRM(Math.floor(tile.price * .5))}</dd></div>
            </dl>
            <div className={`space-details__house ${property?.isLeveledUp ? 'is-built' : ''}`}>
              <span className="space-details__house-icon" />
              <div><small>BUILDING STATUS</small><strong>{property?.isLeveledUp ? 'HOUSE BUILT' : 'NO HOUSE'}</strong></div>
            </div>
          </>
        ) : (
          <p className="space-details__description">{SPECIAL_COPY[tile.type] ?? 'Resolve this board event.'}</p>
        )}
        {children && <div className="space-details__actions">{children}</div>}
      </div>
    </aside>
  );
}
