import { Component, useEffect, useState, type ReactNode } from 'react';

/**
 * How this browser can draw 3D: on the graphics chip (`hardware`), only in
 * software on the processor (`software`, e.g. with graphics acceleration
 * turned off, far too slow for the full table), or not at all (`none`).
 */
export type GraphicsSupport = 'hardware' | 'software' | 'none';

let support: GraphicsSupport | null = null;

/** Probed once per page; the probe's contexts are released straight away. */
export function graphicsSupport(): GraphicsSupport {
  if (support) return support;
  const probe = (options?: WebGLContextAttributes) => {
    try {
      const context = document.createElement('canvas').getContext('webgl2', options);
      context?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!context;
    } catch {
      return false;
    }
  };
  // Browsers refuse this flag when they would draw in software.
  support = probe({ failIfMajorPerformanceCaveat: true }) ? 'hardware' : probe() ? 'software' : 'none';
  return support;
}

export class BoardSceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Show the basic fallback only if a lazy 3D scene is still loading after `delayMs`. */
export function DelayedFallback({ delayMs, placeholder = null, children }: { delayMs: number; placeholder?: ReactNode; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return <>{visible ? children : placeholder}</>;
}

/** Rendered inside a 3D canvas: reports once its scene has drawn a frame. */
export function SceneReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(frame);
  }, [onReady]);
  return null;
}

const PIP_POSITIONS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function BasicDice({ values, rolling }: { values: [number, number]; rolling: boolean }) {
  const activeValues = values.filter((value) => value >= 1 && value <= 6);
  return (
    <div className={`basic-dice${rolling ? ' basic-dice--rolling' : ''}`} aria-label={`Dice showing ${activeValues.join(' and ')}`}>
      {activeValues.map((value, index) => (
        <span key={index} className="basic-die" aria-hidden="true">
          {Array.from({ length: 9 }, (_, pip) => <i key={pip} className={PIP_POSITIONS[value].includes(pip) ? 'basic-die-pip' : ''} />)}
        </span>
      ))}
    </div>
  );
}
