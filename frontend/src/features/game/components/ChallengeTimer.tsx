import { useEffect, useState } from 'react';
import './ChallengeTimer.css';

interface Props {
  /** Unix ms deadline, issued by the server. */
  expiresAt: number;
  totalSeconds: number;
  /** Stop counting once the player has committed to an answer. */
  paused?: boolean;
}

/**
 * Counts down to the server's deadline. Purely informational — the server runs
 * its own timer and auto-submits, so a stopped or throttled tab cannot buy the
 * player extra time.
 */
export function ChallengeTimer({ expiresAt, totalSeconds, paused }: Props) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, expiresAt - Date.now())
  );

  useEffect(() => {
    if (paused) return;

    const tick = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    tick();

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [expiresAt, paused]);

  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalSeconds > 0 ? remainingMs / (totalSeconds * 1000) : 0;
  const urgency = fraction <= 0.25 ? 'critical' : fraction <= 0.5 ? 'low' : 'normal';

  return (
    <div className="challenge-timer" role="timer" aria-live="off">
      <div className="challenge-timer__track">
        <div
          className={`challenge-timer__fill challenge-timer__fill--${urgency}`}
          style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }}
        />
      </div>
      <span className={`challenge-timer__value challenge-timer__value--${urgency}`}>
        {seconds}s
      </span>
    </div>
  );
}
