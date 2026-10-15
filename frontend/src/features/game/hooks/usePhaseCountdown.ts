import { useEffect, useState } from 'react';
import type { GameState } from '../types/game.types';

/**
 * Whole seconds left before the server takes its default action for the
 * current phase, or null when the phase has no deadline.
 *
 * The deadline is server time. Each snapshot carries the server clock, so the
 * offset to this device's clock is measured when the snapshot arrives.
 */
export function usePhaseCountdown(state: Pick<GameState, 'phaseDeadline' | 'serverNow'>): number | null {
  const { phaseDeadline, serverNow } = state;
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (typeof phaseDeadline !== 'number') {
      setSeconds(null);
      return;
    }
    const deadline = phaseDeadline + (typeof serverNow === 'number' ? Date.now() - serverNow : 0);
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [phaseDeadline, serverNow]);

  return seconds;
}
