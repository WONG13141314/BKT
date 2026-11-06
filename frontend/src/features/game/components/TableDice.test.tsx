import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableDice } from './TableDice';
import { DICE_ROLL_LIMIT_MS } from './board.animation';
import { buildThrowPlan, throwDurationMs, throwSeed } from './dice.throw';
import { Quaternion, Vector3 } from 'three';

// In this DOM stand-in a <group> is an unknown element; give it a transform.
for (const [key, make] of [['position', () => new Vector3()], ['quaternion', () => new Quaternion()]] as const) {
  const values = new WeakMap<object, unknown>();
  Object.defineProperty(HTMLUnknownElement.prototype, key, {
    configurable: true,
    get() {
      if (!values.has(this)) values.set(this, make());
      return values.get(this);
    },
  });
}

const frames = vi.hoisted(() => ({ callbacks: new Set<() => void>(), now: 0 }));

vi.mock('@react-three/fiber', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    useThree: (select: (state: { invalidate: () => void }) => unknown) => select({ invalidate: () => undefined }),
    useFrame: (callback: () => void) => {
      const latest = useRef(callback);
      latest.current = callback;
      useEffect(() => {
        const run = () => latest.current();
        frames.callbacks.add(run);
        return () => { frames.callbacks.delete(run); };
      }, []);
    },
  };
});
vi.mock('@react-three/drei', () => ({ RoundedBox: () => null }));

/** Draws one frame `ms` after the previous one. */
function frame(ms: number) {
  frames.now += ms;
  act(() => { frames.callbacks.forEach((callback) => callback()); });
}

describe('TableDice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frames.callbacks.clear();
    frames.now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => frames.now);
    // The test renders Three.js elements as unknown DOM tags.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const duration = throwDurationMs(buildThrowPlan(1, throwSeed(1, [2, 3]), [2, 3]).recording);

  it('finishes when the recorded throw has played, timed from the first frame drawn', () => {
    const onRollingChange = vi.fn();
    render(<TableDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    expect(onRollingChange.mock.calls).toEqual([[true]]);

    // A slow first frame does not eat into the throw.
    frame(800);
    frame(duration - 20);
    expect(onRollingChange.mock.calls).toEqual([[true]]);
    frame(25);
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);

    frame(16);
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('still completes once at the safety limit if no frames are drawn', () => {
    const onRollingChange = vi.fn();
    render(<TableDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS - 1));
    expect(onRollingChange.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(1));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('ends at once when the board says the roll is already over', () => {
    const onRollingChange = vi.fn();
    render(<TableDice values={[2, 3]} rollId={1} animate={false} onRollingChange={onRollingChange} />);
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('starts a new throw for the next roll', () => {
    const onRollingChange = vi.fn();
    const { rerender } = render(<TableDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    frame(16);
    frame(duration + 5);
    rerender(<TableDice values={[4, 4]} rollId={2} onRollingChange={onRollingChange} />);
    expect(onRollingChange.mock.calls).toEqual([[true], [false], [true]]);
  });
});
