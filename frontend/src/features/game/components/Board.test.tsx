import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, Player } from '../types/game.types';
import { Board } from './Board';
import { DICE_ROLL_LIMIT_MS, TOKEN_STEP_MS } from './board.animation';

const dice = vi.hoisted(() => ({ onRollingChange: undefined as ((rolling: boolean) => void) | undefined, fail: false }));
const rendering = vi.hoisted(() => ({ supported: true }));
vi.mock('./BoardRendering', async (importOriginal) => ({
  ...await importOriginal<typeof import('./BoardRendering')>(),
  hasWebGL2: () => rendering.supported,
}));
vi.mock('./PhysicsDice', () => ({
  PhysicsDice: ({ onRollingChange }: { onRollingChange: (rolling: boolean) => void }) => {
    if (dice.fail) throw new Error('Scene failed to load');
    dice.onRollingChange = onRollingChange;
    return <div data-testid="dice" />;
  },
}));
vi.mock('./BoardPiecesScene', () => ({
  BoardPiecesScene: ({ players }: { players: Player[] }) => <div data-testid="token-position">{players[0].position}</div>,
}));

function makeState(position = 0, rollId = 0, turnPhase: GameState['turnPhase'] = 'ROLL_PHASE'): GameState {
  return {
    id: 'game-one', players: [{ id: 'player-one', name: 'Alex', position, money: 800 }],
    properties: [], tiles: Array.from({ length: 20 }, (_, index) => ({ index, type: 'GO', name: 'Go' })),
    diceValues: [2, 3], diceRollId: rollId, turnPhase,
  } as unknown as GameState;
}

async function mountBoard() {
  const callbacks = {
    onDiceRollingChange: vi.fn(), onMovementChange: vi.fn(),
    onMovementStep: vi.fn(), onMovementComplete: vi.fn(),
  };
  const props = { selectedTile: 0, onTileSelect: vi.fn(), ...callbacks };
  const view = render(<Board gameState={makeState()} {...props} />);
  await act(async () => { await Promise.resolve(); });
  if (rendering.supported && !dice.fail) expect(screen.getByTestId('dice')).toBeInTheDocument();
  return { ...view, callbacks, update: (state: GameState) => view.rerender(<Board gameState={state} {...props} />) };
}

describe('board playback ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers(); dice.onRollingChange = undefined; dice.fail = false; rendering.supported = true;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('finishes the dice before walking and waits for the final token hop before acknowledging arrival', async () => {
    const { update, callbacks } = await mountBoard();
    update(makeState(2, 1, 'MOVING'));
    act(() => vi.advanceTimersByTime(500));
    expect(callbacks.onMovementStep).not.toHaveBeenCalled();
    expect(callbacks.onMovementComplete).not.toHaveBeenCalled();

    act(() => { dice.onRollingChange?.(false); });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByTestId('token-position')).toHaveTextContent('1');
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS));
    expect(screen.getByTestId('token-position')).toHaveTextContent('2');
    expect(callbacks.onMovementComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS));
    expect(callbacks.onMovementComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.onDiceRollingChange.mock.calls).toEqual([[true], [false]]);
    expect(callbacks.onMovementChange.mock.calls).toEqual([[true], [false]]);

    update({ ...makeState(2, 1, 'MOVING'), players: [{ ...makeState(2).players[0], money: 700 }] });
    act(() => vi.advanceTimersByTime(1000));
    expect(callbacks.onMovementComplete).toHaveBeenCalledTimes(1);
  });

  it('bounds unavailable dice animation so an active turn can continue', async () => {
    const { update, callbacks } = await mountBoard();
    update(makeState(1, 1, 'MOVING'));
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS - 1));
    expect(callbacks.onMovementStep).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(0));
    expect(callbacks.onMovementStep).toHaveBeenCalledWith(1, 'player-one');
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS));
    expect(callbacks.onMovementComplete).toHaveBeenCalledTimes(1);
  });

  it('does not accelerate walking when a money or status broadcast arrives', async () => {
    const { update, callbacks } = await mountBoard();
    update(makeState(3, 1, 'MOVING'));
    act(() => { dice.onRollingChange?.(false); });
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(100));
    update({ ...makeState(3, 1, 'MOVING'), players: [{ ...makeState(3).players[0], money: 900 }] });
    act(() => vi.advanceTimersByTime(0));
    expect(callbacks.onMovementStep).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS - 100));
    expect(callbacks.onMovementStep).toHaveBeenCalledTimes(2);
  });

  it('ignores a late completion from an older roll', async () => {
    const { update, callbacks } = await mountBoard();
    update(makeState(1, 1, 'MOVING'));
    const finishOlderRoll = dice.onRollingChange;
    update(makeState(2, 2, 'MOVING'));
    callbacks.onDiceRollingChange.mockClear();
    act(() => { finishOlderRoll?.(false); });
    act(() => vi.advanceTimersByTime(0));
    expect(callbacks.onDiceRollingChange).not.toHaveBeenCalled();
    expect(callbacks.onMovementStep).not.toHaveBeenCalled();
    act(() => { dice.onRollingChange?.(false); });
    act(() => vi.advanceTimersByTime(0));
    expect(callbacks.onMovementStep).toHaveBeenCalledTimes(1);
  });

  it('allocates no idle movement polling timers', async () => {
    await mountBoard();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps visible dice, player markers and paced turns when WebGL is unavailable', async () => {
    rendering.supported = false;
    const { update, callbacks } = await mountBoard();
    expect(screen.getByLabelText('Dice showing 2 and 3')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Alex on space 0' })).toBeVisible();
    expect(screen.queryByTestId('dice')).not.toBeInTheDocument();
    update(makeState(1, 1, 'MOVING'));
    expect(screen.getByLabelText('Dice showing 2 and 3')).toHaveClass('basic-dice--rolling');
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('img', { name: 'Alex on space 1' })).toBeVisible();
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS));
    expect(callbacks.onMovementComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Dice showing 2 and 3')).not.toHaveClass('basic-dice--rolling');
  });

  it('switches to visible basic pieces if a mounted canvas loses its context', async () => {
    await mountBoard();
    fireEvent(screen.getByTestId('dice'), new Event('webglcontextlost', { bubbles: false }));
    expect(screen.getByLabelText('Dice showing 2 and 3')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Alex on space 0' })).toBeVisible();
    expect(screen.queryByTestId('dice')).not.toBeInTheDocument();
  });

  it('contains scene or chunk failures without losing board controls or turn completion', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dice.fail = true;
    const { update, callbacks } = await mountBoard();
    expect(screen.getByLabelText('Dice showing 2 and 3')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'View Go' })).toHaveLength(20);
    update(makeState(1, 1, 'MOVING'));
    act(() => vi.advanceTimersByTime(DICE_ROLL_LIMIT_MS));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(TOKEN_STEP_MS));
    expect(callbacks.onMovementComplete).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });
});
