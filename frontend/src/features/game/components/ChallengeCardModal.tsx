import { ChallengeCard } from '../types/game.types';
import './ChallengeCardModal.css';

interface Props {
  card: ChallengeCard;
  onClose: () => void;
  children?: React.ReactNode; // For embedded math challenge
}

export function ChallengeCardModal({ card, onClose, children }: Props) {
  return (
    <div className="card-modal-overlay" onClick={!card.isMathCard ? onClose : undefined}>
      <div className="card-modal" onClick={(e) => e.stopPropagation()}>
        {/* Card header */}
        <div className={`card-modal-header ${card.isMathCard ? 'math-card' : 'luck-card'}`}>
          <span className="card-modal-icon">
            {card.isMathCard ? '🧮' : '🎲'}
          </span>
          <h3 className="card-modal-title">{card.name}</h3>
        </div>

        {/* Card body */}
        <div className="card-modal-body">
          <p className="card-modal-description">{card.description}</p>

          {/* Math challenge or luck effect */}
          {children ? (
            <div className="card-modal-challenge">
              {children}
            </div>
          ) : (
            <button className="card-modal-ok" onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
