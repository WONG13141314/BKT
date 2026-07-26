// Math Duel — the property dispute card.
//
// Both duellists answer at the same time, each on a question chosen for them.
// While the duel runs, neither side sees the other's question: seeing an
// easier-looking question opposite reads as unfair even when both are correctly
// calibrated. Only the verdict is shared, and only once both are in.
//
// Onlookers get the same card with both questions hidden, so the whole table
// watches the reveal together.

import { useEffect, useState } from 'react';
import { Clock, Swords } from 'lucide-react';
import { Player, PublicDuelState, formatRM } from '../types/game.types';
import './MathDuel.css';

interface MathDuelProps {
  duel: PublicDuelState;
  players: Player[];
  /** Persistent profile id of the viewer. */
  myPlayerId: string;
  /** The viewer's own question, already rendered by the caller. */
  questionSlot: React.ReactNode;
  /** True when the viewer is in this duel and has not answered yet. */
  isMyTurnToAnswer: boolean;
}

function useCountdown(expiresAt: number, frozen: boolean): number {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    if (frozen) return;

    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();

    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt, frozen]);

  return remaining;
}

export function MathDuel({
  duel,
  players,
  myPlayerId,
  questionSlot,
  isMyTurnToAnswer,
}: MathDuelProps) {
  const resolved = duel.resolution;
  const secondsLeft = useCountdown(duel.expiresAt, !!resolved);

  const seatOf = (seatId: string) => players.find((p) => p.id === seatId) ?? null;
  const challenger = seatOf(duel.challenger.playerId);
  const owner = seatOf(duel.owner.playerId);

  const isMe = (seatId: string) => {
    const seat = seatOf(seatId);
    return !!seat && (seat.playerId === myPlayerId || seat.id === myPlayerId);
  };

  const amDuellist = isMe(duel.challenger.playerId) || isMe(duel.owner.playerId);

  const stamp = resolved
    ? {
        CHALLENGER_WINS: 'RENT DEFENDED',
        OWNER_WINS: 'PROPERTY HELD',
        DRAW_BOTH: 'HONOURS EVEN',
        DRAW_NEITHER: 'NO CONTEST',
      }[resolved.outcome]
    : null;

  const renderSide = (
    side: PublicDuelState['challenger'],
    seat: Player | null,
    role: 'challenger' | 'owner'
  ) => {
    const mine = isMe(side.playerId);
    const status = resolved
      ? side.isCorrect
        ? 'correct'
        : 'wrong'
      : side.hasAnswered
        ? 'locked'
        : 'thinking';

    return (
      <div className={`duel-side duel-side--${status} ${mine ? 'duel-side--mine' : ''}`}>
        <div className="duel-side__token" style={{ background: seat?.color ?? '#888' }} />
        <div className="duel-side__name">{mine ? 'You' : (seat?.name ?? 'Player')}</div>
        <div className="duel-side__role">
          {role === 'challenger' ? 'Challenger' : 'Landlord'}
        </div>
        <div className="duel-side__status">
          {resolved
            ? side.isCorrect
              ? 'Correct'
              : 'Missed it'
            : side.hasAnswered
              ? 'Locked in'
              : 'Thinking…'}
        </div>
      </div>
    );
  };

  return (
    <div className="duel-overlay">
      <div className={`duel-card ${resolved ? 'duel-card--resolved' : ''}`}>
        <header className="duel-card__deed">
          <div className="duel-card__banner">
            <Swords size={16} /> Property Dispute
          </div>
          <h2 className="duel-card__title">{duel.tileName}</h2>
          <div className="duel-card__meta">
            <span>{duel.skillName}</span>
            <span className="duel-card__stake">Rent at stake {formatRM(duel.rentAmount)}</span>
          </div>
        </header>

        <div className="duel-card__versus">
          {renderSide(duel.challenger, challenger, 'challenger')}
          <div className="duel-card__vs">VS</div>
          {renderSide(duel.owner, owner, 'owner')}
        </div>

        {!resolved && (
          <div className="duel-card__timer">
            <Clock size={14} />
            <div className="duel-timer__track">
              <div
                className="duel-timer__fill"
                style={{ width: `${Math.min(100, (secondsLeft / duel.timeLimit) * 100)}%` }}
              />
            </div>
            <span className="duel-timer__value">{secondsLeft}s</span>
          </div>
        )}

        <div className="duel-card__body">
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
            <p className="duel-card__waiting">
              Answer locked in. Waiting for your opponent…
            </p>
          ) : (
            <p className="duel-card__waiting">
              {challenger?.name ?? 'Challenger'} is disputing the rent with{' '}
              {owner?.name ?? 'the owner'}.
            </p>
          )}
        </div>

        {!resolved && (
          <footer className="duel-card__rules">
            Both right — rent halved · You alone right — no rent · Landlord alone right — full rent
          </footer>
        )}
      </div>
    </div>
  );
}
