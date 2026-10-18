import { useEffect, useState } from 'react';

/** Short drops usually recover on their own; say nothing until this long offline. */
export const RECONNECT_TAG_DELAY_MS = 2_000;
/** Cover the table only once a drop has clearly lasted. */
export const RECONNECT_PANEL_DELAY_MS = 8_000;

export type ConnectionNotice = 'none' | 'tag' | 'panel';

/**
 * How loudly to report a lost connection: nothing for a brief drop, a small tag
 * after two seconds, and the full panel after eight.
 */
export function useConnectionNotice(isConnected: boolean): ConnectionNotice {
  const [notice, setNotice] = useState<ConnectionNotice>('none');

  useEffect(() => {
    setNotice('none');
    if (isConnected) return;
    const tag = setTimeout(() => setNotice('tag'), RECONNECT_TAG_DELAY_MS);
    const panel = setTimeout(() => setNotice('panel'), RECONNECT_PANEL_DELAY_MS);
    return () => {
      clearTimeout(tag);
      clearTimeout(panel);
    };
  }, [isConnected]);

  return notice;
}
