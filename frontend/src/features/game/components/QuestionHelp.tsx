import { useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { ChallengeHint, HintHighlight } from '../types/game.types';
import './QuestionHelp.css';

interface Props {
  hint?: ChallengeHint | null;
  onRequestHint?: () => Promise<void>;
  disabled: boolean;
  expiresAt: number;
  timeLimit: number;
  /** Hints this learner has left this match; undefined when not limited. */
  hintsRemaining?: number;
}

export function isHintHighlighted(
  hint: ChallengeHint | null | undefined,
  row: HintHighlight['row'],
  column?: number,
  stepIndex?: number,
): boolean {
  return !!hint?.highlights.some((highlight) =>
    highlight.row === row
    && (highlight.column === undefined || highlight.column === column)
    && (highlight.stepIndex === undefined || highlight.stepIndex === stepIndex)
  );
}

/** One private, optional starting cue. Requesting help never changes the deadline. */
export function QuestionHelp({ hint, onRequestHint, disabled, expiresAt, timeLimit, hintsRemaining }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const requestHelp = async () => {
    if (!onRequestHint || hint || disabled || hintsRemaining === 0 || pendingRef.current
      || (timeLimit > 0 && Date.now() >= expiresAt)) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onRequestHint();
    } catch (requestError) {
      if (mountedRef.current) {
        setError(requestError instanceof Error ? requestError.message : 'Could not load help. Try again.');
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };

  if (hint) {
    return (
      <div className="question-help__cue" role="status" aria-live="polite" aria-atomic="true">
        <Lightbulb size={18} aria-hidden="true" />
        <p>{hint.content}</p>
      </div>
    );
  }

  if (!onRequestHint) return null;
  const outOfHints = hintsRemaining === 0;
  return (
    <div className="question-help">
      <button
        type="button"
        className="question-help__button"
        onClick={() => { void requestHelp(); }}
        disabled={disabled || pending || outOfHints}
        aria-busy={pending}
      >
        <Lightbulb size={17} aria-hidden="true" />
        {pending ? 'Getting help…' : outOfHints ? 'No hints left this game' : 'Help me start'}
        {!pending && !outOfHints && hintsRemaining !== undefined && (
          <span className="question-help__count">{hintsRemaining} left</span>
        )}
      </button>
      {error && <p className="question-help__error" role="alert">{error}</p>}
    </div>
  );
}
