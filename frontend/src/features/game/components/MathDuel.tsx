import { Player, PublicDuelState, formatRM } from '../types/game.types';
import './MathDuel.css';
import { Swords } from 'lucide-react';
import { useId, useRef } from 'react';
import { useDialogFocus } from '../../../shared/hooks/useDialogFocus';

interface MathDuelProps {
  duel: PublicDuelState;
  players: Player[];
  myPlayerId: string;
  questionSlot: React.ReactNode;
  isMyTurnToAnswer: boolean;
}

export function MathDuel({
  duel,
  players,
  myPlayerId,
  questionSlot,
  isMyTurnToAnswer,
}: MathDuelProps) {
  const resolved = duel.resolution;

  const seatOf = (seatId: string) => players.find((p) => p.id === seatId) ?? null;
  const challenger = seatOf(duel.challenger.playerId);
  const owner = seatOf(duel.owner.playerId);

  const isMe = (seatId: string) => {
    const seat = seatOf(seatId);
    return !!seat && (seat.playerId === myPlayerId || seat.id === myPlayerId);
  };

  const amDuellist = isMe(duel.challenger.playerId) || isMe(duel.owner.playerId);
  const titleId = useId();
  const duelRef = useRef<HTMLDivElement>(null);
  const isAnswerDialog = amDuellist && isMyTurnToAnswer && !resolved;
  useDialogFocus(isAnswerDialog, duelRef);

  const stamp = resolved
    ? {
        CHALLENGER_WINS: 'RENT DEFENDED',
        OWNER_WINS: 'PROPERTY HELD',
        DRAW_BOTH: 'HONOURS EVEN',
        DRAW_NEITHER: 'NO CONTEST',
      }[resolved.outcome]
    : null;

  return (
    <div className="card-modal-overlay" style={{ zIndex: 1000 }}>
      <div
        ref={duelRef}
        className="card-modal duel-card-modal"
        onClick={(e) => e.stopPropagation()}
        role={isAnswerDialog ? 'dialog' : 'status'}
        aria-modal={isAnswerDialog ? 'true' : undefined}
        aria-labelledby={titleId}
        tabIndex={isAnswerDialog ? -1 : undefined}
      >
        <div className="card-modal-header math-card duel-header">
          <Swords size={28} className="duel-header-icon" />
          <h3 id={titleId} className="card-modal-title">Property Dispute</h3>
        </div>

        <div className="card-modal-body duel-body">
          <div className="duel-banner">
            <span className={isMe(duel.challenger.playerId) ? "duel-me" : ""}>
              Challenger: {challenger?.name ?? 'Player'}
            </span>
            <span className="duel-vs">VS</span>
            <span className={isMe(duel.owner.playerId) ? "duel-me" : ""}>
              Landlord: {owner?.name ?? 'Player'}
            </span>
          </div>
          
          <div className="duel-meta">
            {duel.tileName} • Rent {formatRM(duel.rentAmount)}
          </div>

          <div className="duel-content">
            {resolved ? (
              <div className="duel-result">
                <div className={`duel-result__stamp duel-result__stamp--${resolved.outcome}`}>
                  {stamp}
                </div>
                <p className="duel-result__headline">{resolved.headline}</p>
              </div>
            ) : isMyTurnToAnswer ? (
              questionSlot
            ) : amDuellist ? (
              <div className="duel-waiting">
                <p>Answer locked in. Waiting for your opponent…</p>
              </div>
            ) : (
              <div className="duel-waiting">
                <p>
                  {challenger?.name ?? 'Challenger'} is disputing the rent with{' '}
                  {owner?.name ?? 'the owner'}.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
