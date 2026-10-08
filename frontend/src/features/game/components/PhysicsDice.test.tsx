import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren, Ref } from 'react';
import { PhysicsDice } from './PhysicsDice';
import { DICE_ROLL_LIMIT_MS, DICE_SETTLE_HOLD_MS } from './board.animation';

const simulation = vi.hoisted(() => ({
  bodies: [] as {
    linear: { x: number; y: number; z: number };
    angular: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  }[],
  steps: new Set<() => void>(),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@react-three/drei', () => ({ RoundedBox: () => null }));
vi.mock('@react-three/rapier', async () => {
  const { useEffect, useImperativeHandle, useMemo } = await import('react');
  return {
    Physics: ({ children }: PropsWithChildren) => <div>{children}</div>,
    CuboidCollider: () => null,
    RigidBody: ({ children, ref }: PropsWithChildren<{ ref?: Ref<unknown> }>) => {
      const body = useMemo(() => ({
        linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 1, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      }), []);
      useImperativeHandle(ref, () => ({
        linvel: () => body.linear, angvel: () => body.angular, rotation: () => body.orientation,
        isSleeping: () => false,
      }), [body]);
      useEffect(() => {
        if (!ref) return;
        simulation.bodies.push(body);
        return () => { simulation.bodies = simulation.bodies.filter((item) => item !== body); };
      }, [body, ref]);
      return <div>{children}</div>;
    },
    useAfterPhysicsStep: (callback: () => void) => {
      useEffect(() => {
        simulation.steps.add(callback);
        return () => { simulation.steps.delete(callback); };
      }, [callback]);
    },
  };
});
vi.mock('./dice.throw', async (importOriginal) => {
  const original = await importOriginal<typeof import('./dice.throw')>();
  return {
    ...original,
    buildThrowPlan: (id: number, seed: number, values: number[]) => ({
      id, seed,
      dice: values.map((value) => ({
        value, position: [0, .51, 0], rotation: [0, 0, 0],
        linearVelocity: [1, 0, 0], angularVelocity: [0, 1, 0],
        modelRotation: original.restingRotation(value, 0),
      })),
    }),
  };
});

function restDie(index: number) {
  simulation.bodies[index].linear = { x: 0, y: 0, z: 0 };
  simulation.bodies[index].angular = { x: 0, y: 0, z: 0 };
}

function stepPhysics() {
  act(() => { simulation.steps.forEach((step) => step()); });
}

describe('dice result settling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    simulation.bodies = [];
    simulation.steps.clear();
    // The test scene uses DOM stand-ins for Three.js meshes and lights.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('finishes after both readable results rest briefly, before the physics sleep cooldown', () => {
    const onRollingChange = vi.fn();
    render(<PhysicsDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    restDie(0);
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS));
    expect(onRollingChange.mock.calls).toEqual([[true]]);

    restDie(1);
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS - 1));
    expect(onRollingChange.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(1));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('restarts the brief result hold if either die starts moving again', () => {
    const onRollingChange = vi.fn();
    render(<PhysicsDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    restDie(0);
    restDie(1);
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS - 1));
    simulation.bodies[0].angular = { x: 0, y: .3, z: 0 };
    stepPhysics();
    act(() => vi.advanceTimersByTime(1));
    expect(onRollingChange.mock.calls).toEqual([[true]]);

    restDie(0);
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS - 1));
    expect(onRollingChange.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(1));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('waits for the intended face upward instead of freezing an unreadable or incorrect result', () => {
    const onRollingChange = vi.fn();
    render(<PhysicsDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    restDie(0);
    restDie(1);
    simulation.bodies[0].orientation = { x: 1, y: 0, z: 0, w: 0 };
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS));
    expect(onRollingChange.mock.calls).toEqual([[true]]);

    simulation.bodies[0].orientation = { x: 0, y: 0, z: 0, w: 1 };
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_SETTLE_HOLD_MS));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('still completes once at the safety limit if the dice never settle', () => {
    const onRollingChange = vi.fn();
    render(<PhysicsDice values={[2, 3]} rollId={1} onRollingChange={onRollingChange} />);
    stepPhysics();
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS - 1));
    expect(onRollingChange.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(1));
    expect(onRollingChange.mock.calls).toEqual([[true], [false]]);
  });
});
