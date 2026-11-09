import { useLayoutEffect, useRef } from 'react';

/**
 * Shows a piece of the board's printed artwork (a canvas drawn once) at a given
 * size, sharp on high-density screens.
 */
export function ArtCanvas({ source, width, height }: { source: HTMLCanvasElement; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    const context = element.getContext('2d');
    if (!context) return;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, element.width, element.height);
  }, [source, width, height]);
  return <canvas ref={canvas} aria-hidden="true" />;
}
