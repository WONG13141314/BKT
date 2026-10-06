import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnQuestion } from './ColumnQuestion';
import { LongDivisionQuestion } from './LongDivisionQuestion';
import type { ChallengeHint, ColumnQuestion as ColumnData, LongDivisionQuestion as DivisionData } from '../types/game.types';

const column: ColumnData = {
  type: 'column', operation: '+', columns: ['tens', 'ones'],
  topCells: ['3', '?'], bottomCells: ['1', '6'], answerCells: ['5', '2'],
  hiddenRow: null,
};
const columnHint: ChallengeHint = {
  content: 'Start in the ones column. What digit plus 6 ends in 2?',
  highlights: [{ row: 'top', column: 1 }, { row: 'bottom', column: 1 }, { row: 'answer', column: 1 }],
};
const options = ['4', '6', '7', '8'];

describe('optional question help', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => vi.useRealTimers());

  it('requests help once, keeps choices and the deadline, and preserves the committed answer on a same-question refresh', async () => {
    let finishRequest!: () => void;
    const onRequestHint = vi.fn(() => new Promise<void>((resolve) => { finishRequest = resolve; }));
    const onAnswer = vi.fn();
    const props = { question: column, options, onAnswer, onRequestHint, expiresAt: 70_000, timeLimit: 60 };
    const { rerender, container } = render(<ColumnQuestion key="question-one" {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Help me start' }));
    expect(screen.getByRole('button', { name: 'Getting help…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Getting help…' }));
    expect(onRequestHint).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '4' })).toBeEnabled();

    act(() => { vi.advanceTimersByTime(5_000); });
    await act(async () => { finishRequest(); });
    rerender(<ColumnQuestion key="question-one" {...props} hint={columnHint} />);
    expect(screen.getByRole('status')).toHaveTextContent(columnHint.content);
    expect(container.querySelectorAll('.question-hint-highlight')).toHaveLength(3);
    expect(screen.getByRole('timer')).toHaveTextContent('55 seconds');
    expect(screen.getByRole('button', { name: '4' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '6' }));
    rerender(<ColumnQuestion key="question-one" {...props} hint={{ ...columnHint }} />);
    expect(screen.getByRole('button', { name: '6' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: '6' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  it('shows a request error and allows another try while preserving answer choices', async () => {
    vi.useRealTimers();
    const onRequestHint = vi.fn().mockRejectedValue(new Error('Could not load help. Try again.'));
    render(<ColumnQuestion question={column} options={options} onAnswer={vi.fn()}
      onRequestHint={onRequestHint} expiresAt={Date.now() + 60_000} timeLimit={60} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help me start' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load help. Try again.'));
    expect(screen.getByRole('button', { name: 'Help me start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '4' })).toBeEnabled();
  });

  it('disables help and answer choices when the original server deadline expires', () => {
    const onRequestHint = vi.fn(() => Promise.resolve());
    const onAnswer = vi.fn();
    render(<ColumnQuestion question={column} options={options} onAnswer={onAnswer}
      onRequestHint={onRequestHint} expiresAt={10_200} timeLimit={60} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('button', { name: 'Help me start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '4' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Help me start' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onRequestHint).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('restores a division hint and highlights only its specified public step', () => {
    const division: DivisionData = {
      type: 'long_division', divisor: 3, dividendCells: ['3', '9', '6'],
      quotientCells: ['1', '3', '2'], remainderCell: null,
      steps: [
        { productCells: ['3', '', ''], showMinus: true, lineFrom: 0, lineTo: 0, resultCells: ['0', '9', ''] },
        { productCells: ['', '9', ''], showMinus: true, lineFrom: 1, lineTo: 1, resultCells: ['', '0', '6'] },
        { productCells: ['', '', '?'], showMinus: true, lineFrom: 2, lineTo: 2, resultCells: null },
      ],
    };
    const hint: ChallengeHint = {
      content: 'Multiply the quotient digit above this column by the divisor.',
      highlights: [{ row: 'quotient', column: 2 }, { row: 'divisor' }, { row: 'product', column: 2, stepIndex: 2 }],
    };
    const onRequestHint = vi.fn(() => Promise.resolve());
    const { container } = render(<LongDivisionQuestion question={division} options={['3', '5', '6', '9']}
      hint={hint} onAnswer={vi.fn()} onRequestHint={onRequestHint} expiresAt={70_000} timeLimit={60} />);

    expect(screen.getByRole('status')).toHaveTextContent(hint.content);
    expect(screen.queryByRole('button', { name: 'Help me start' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.question-hint-highlight')).toHaveLength(3);
    const steps = container.querySelectorAll('.ld-step');
    expect(steps[0].querySelector('.question-hint-highlight')).toBeNull();
    expect(steps[1].querySelector('.question-hint-highlight')).toBeNull();
    expect(steps[2].querySelector('.question-hint-highlight')).toHaveTextContent('?');
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    expect(onRequestHint).not.toHaveBeenCalled();
  });
});
