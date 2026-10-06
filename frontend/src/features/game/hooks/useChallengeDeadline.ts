import { useEffect, useState } from 'react';

/** The server still grades expiry; disable controls while its result is arriving. */
export function useChallengeDeadline(expiresAt: number, timeLimit: number): boolean {
  const [expired, setExpired] = useState(() => timeLimit > 0 && Date.now() >= expiresAt);

  useEffect(() => {
    const tick = () => setExpired(timeLimit > 0 && Date.now() >= expiresAt);
    tick();
    if (timeLimit <= 0) return;
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [expiresAt, timeLimit]);

  return expired;
}
