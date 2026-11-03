import { useEffect, useState } from 'react';
import type { ChallengeCard } from '../types/game.types';
import './CardDraw.css';

interface Props {
  card: ChallengeCard;
  drawerName: string;
  /** The drawer picks the card and carries it out; everyone else watches. */
  isDrawer: boolean;
  reducedMotion: boolean;
  onDone: () => void;
}

type Stage = 'deck' | 'drawing' | 'shown';

/** How long the drawer may leave the deck before the top card is drawn for them. */
const AUTO_DRAW_MS = 6_000;
/** Onlookers see the draw start at once. */
const WATCH_DRAW_MS = 350;
/** The lift-and-turn animation in CardDraw.css. */
const DRAW_ANIMATION_MS = 1_000;

/**
 * A Challenge Card coming off the deck: the drawer taps the deck, the top card
 * lifts and turns over, and only then is it carried out. The server waits for
 * that acknowledgement, so a math card's question timer starts after the reveal.
 */
export function CardDraw({ card, drawerName, isDrawer, reducedMotion, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(reducedMotion ? 'shown' : 'deck');

  useEffect(() => {
    if (stage !== 'deck') return;
    const timer = setTimeout(() => setStage('drawing'), isDrawer ? AUTO_DRAW_MS : WATCH_DRAW_MS);
    return () => clearTimeout(timer);
  }, [stage, isDrawer]);

  useEffect(() => {
    if (stage !== 'drawing') return;
    const timer = setTimeout(() => setStage('shown'), DRAW_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  const kind = card.isMathCard ? 'math' : 'luck';

  return (
    <div className={`card-draw card-draw--${stage}${isDrawer ? ' card-draw--drawer' : ' card-draw--watching'}`}>
      <div className="card-draw__stage">
        <div className="card-draw__deck" aria-hidden="true">
          {[3, 2, 1].map((depth) => (
            <span key={depth} className="card-draw__back card-draw__back--stacked" style={{ '--depth': depth } as React.CSSProperties}>
              <CardBack />
            </span>
          ))}
        </div>

        <div className="card-draw__flipper">
          <button
            type="button"
            className="card-draw__face card-draw__face--back"
            onClick={() => setStage('drawing')}
            disabled={!isDrawer || stage !== 'deck'}
            aria-label="Draw the top Challenge Card"
          >
            <CardBack />
          </button>

          <article className="card-draw__face card-draw__face--front" aria-hidden={stage === 'deck'}>
            <header className={`card-draw__header card-draw__header--${kind}`}>
              <span className="card-draw__icon" aria-hidden="true">{card.isMathCard ? '🧮' : '🎲'}</span>
              <div>
                <small>{card.isMathCard ? 'Math card' : 'Luck card'}</small>
                <h3>{card.name}</h3>
              </div>
            </header>
            <div className="card-draw__body">
              <p>{card.description}</p>
              {card.isMathCard && <span className="card-draw__note">A question follows</span>}
            </div>
          </article>
        </div>
      </div>

      <div className="card-draw__footer" aria-live="polite">
        {stage === 'deck' && (
          isDrawer
            ? <span className="card-draw__prompt">Tap the deck to draw a card</span>
            : <span className="card-draw__prompt">{drawerName} is drawing a card…</span>
        )}
        {stage === 'shown' && (
          isDrawer
            ? (
              <button type="button" className="card-draw__ok" onClick={onDone} autoFocus>
                {card.isMathCard ? 'Solve it' : 'OK'}
              </button>
            )
            : <span className="card-draw__prompt">{drawerName} drew “{card.name}”</span>
        )}
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <span className="card-draw__back-art">
      <b>?</b>
      <small>Challenge</small>
    </span>
  );
}
