import type { ChallengeCard } from '../types/game.types';
import './CardReveal.css';

interface Props {
  card: ChallengeCard;
  drawerName: string;
  /** The drawer carries the card out; everyone else reads it. */
  isDrawer: boolean;
  /** Where the drawn card left the board on screen; the panel grows out of it. */
  origin: { x: number; y: number } | null;
  onDone: () => void;
}

/**
 * The drawn Challenge Card, readable on screen. It grows out of the spot where
 * the card rose off the board, so the table's card becomes the screen's card.
 */
export function CardReveal({ card, drawerName, isDrawer, origin, onDone }: Props) {
  const from = origin && typeof window !== 'undefined'
    ? { x: origin.x - window.innerWidth / 2, y: origin.y - window.innerHeight / 2 }
    : { x: 0, y: 0 };
  const kind = card.isMathCard ? 'math' : 'luck';

  return (
    <div className={`card-reveal${isDrawer ? ' card-reveal--drawer' : ' card-reveal--watching'}`}>
      <article
        className="card-reveal__card"
        style={{ '--from-x': `${from.x}px`, '--from-y': `${from.y}px` } as React.CSSProperties}
        aria-labelledby="card-reveal-title"
      >
        <header className={`card-reveal__header card-reveal__header--${kind}`}>
          <span className="card-reveal__icon" aria-hidden="true">{card.isMathCard ? '🧮' : '🎲'}</span>
          <div>
            <small>{card.isMathCard ? 'Math card' : 'Luck card'}</small>
            <h3 id="card-reveal-title">{card.name}</h3>
          </div>
        </header>
        <div className="card-reveal__body">
          <p>{card.description}</p>
          {card.isMathCard && <span className="card-reveal__note">A question follows</span>}
          {isDrawer ? (
            <button type="button" className="card-reveal__ok" onClick={onDone} autoFocus>
              {card.isMathCard ? 'Solve it' : 'OK'}
            </button>
          ) : (
            <span className="card-reveal__who">{drawerName} drew this card</span>
          )}
        </div>
      </article>
    </div>
  );
}
