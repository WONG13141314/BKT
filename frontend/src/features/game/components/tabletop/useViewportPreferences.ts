import { useEffect, useState } from 'react';
import type { SafeInsets } from './camera';

function query(media: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(media).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query('(prefers-reduced-motion: reduce)'));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(list.matches);
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/**
 * The screen edges the game interface covers, matching the breakpoints in
 * GamePage.css. The camera frames the board inside what remains.
 */
export function hudInsets(width: number, height: number): SafeInsets {
  if (height <= 500 && width > height) return { top: 58, right: 300, bottom: 12, left: 12 };
  if (width >= 1100) return { top: 84, right: 340, bottom: 104, left: 276 };
  if (width >= 700) return { top: 150, right: 16, bottom: 150, left: 16 };
  return { top: 150, right: 8, bottom: 170, left: 8 };
}

export function useHudInsets(): SafeInsets {
  const read = () => hudInsets(window.innerWidth, window.innerHeight);
  const [insets, setInsets] = useState<SafeInsets>(read);
  useEffect(() => {
    const update = () => setInsets((previous) => {
      const next = read();
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
    });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return insets;
}
