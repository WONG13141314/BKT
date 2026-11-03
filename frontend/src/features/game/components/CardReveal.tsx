import type { ChallengeCard } from '../types/game.types';
import './CardReveal.css';

interface Props {
  card: ChallengeCard;
  drawerName: string;
  /** The drawer carries the card out; everyone else reads it. */
  isDrawer: boolean;
  onDone: () => void;
}

/**
 * The drawn Challenge Card as a panel, for boards with no 3D card to hold up
 * (the flat board, or reduced motion).
 */
export function CardReveal({ card, drawerName, isDrawer, onDone }: Props) {
  const kind = card.isMathCard ? 'math' : 'luck';

  return (
    <div className={`card-reveal${isDrawer ? ' card-reveal--drawer' : ' card-reveal--watching'}`}>
      <article className="card-reveal__card" aria-labelledby="card-reveal-title">
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
