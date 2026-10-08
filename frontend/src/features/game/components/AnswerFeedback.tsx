import type { AnswerResult } from '../types/game.types';
import './AnswerFeedback.css';

interface Props {
  result: AnswerResult;
  onContinue?: () => void;
  inDuel?: boolean;
}

/** One result surface combines the outcome, reward and worked maths line. */
export function AnswerFeedback({ result, onContinue, inDuel }: Props) {
  const outcome = result.isCorrect ? 'Correct' : result.timedOut ? "Time's up" : 'Not quite';
  return (
    <section className={`answer-feedback ${result.isCorrect ? 'answer-feedback--correct' : ''}`}
      role="status" aria-live="polite" aria-atomic="true">
      <h3>{inDuel ? `Your answer: ${outcome}` : outcome}</h3>
      {!result.isCorrect && result.correctAnswer && <p>The missing value was <strong>{result.correctAnswer}</strong>.</p>}
      {result.reward?.type !== 'NONE' && result.reward?.description &&
        <p className="answer-feedback__reward">{result.reward.description}</p>}
      {result.feedback && <p className="answer-feedback__worked">{result.feedback}</p>}
      {onContinue && (
        <button type="button" className="answer-feedback__continue" onClick={onContinue} autoFocus>
          Continue
        </button>
      )}
    </section>
  );
}
