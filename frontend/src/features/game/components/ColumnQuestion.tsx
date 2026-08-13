import { useState } from 'react';
import { ColumnQuestion as ColumnQuestionData, DigitCell } from '../types/game.types';
import { ChallengeTimer } from './ChallengeTimer';
import './ColumnQuestion.css';

interface Props {
  question: ColumnQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
  disabled?: boolean;
  expiresAt: number;
  timeLimit: number;
  hintContent?: string | null;
  /** Once graded, the server tells us what belonged in the '?' box. */
  revealedAnswer?: string | null;
}

/**
 * Renders the vertical (column) method. The server sends pre-laid-out cells —
 * it never sends the operands or the answer — so this component only decides
 * how a cell looks, never what it contains.
 */
export function ColumnQuestion({
  question,
  options,
  onAnswer,
  disabled,
  expiresAt,
  timeLimit,
  hintContent,
  revealedAnswer,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (index: number) => {
    if (disabled || answered) return;
    setSelectedOption(index);
    setAnswered(true);
    onAnswer(index);
  };

  const renderCells = (cells: DigitCell[], rowLabel: string) =>
    cells.map((cell, i) => {
      const isTarget = cell === '?';
      const content = isTarget && revealedAnswer ? revealedAnswer : cell;
      return (
        <span
          key={`${rowLabel}-${i}`}
          className={`digit-cell ${isTarget ? 'digit-target' : ''} ${
            isTarget && cells.length === 1 ? 'operand-box' : ''
          }`}
        >
          {content}
        </span>
      );
    });

  return (
    <div className="column-question">
      {timeLimit > 0 && <ChallengeTimer expiresAt={expiresAt} totalSeconds={timeLimit} paused={answered} />}

      <div className="column-stack">
        <div className="column-row column-top">
          <span className="operation-space" />
          {renderCells(question.topCells, 'top')}
        </div>

        <div className="column-row column-bottom">
          <span className="operation-symbol">{question.operation}</span>
          {renderCells(question.bottomCells, 'bottom')}
        </div>

        <div className="column-line" />

        <div className="column-row column-answer">
          <span className="operation-space" />
          {renderCells(question.answerCells, 'answer')}
        </div>

        {question.hasRegrouping && !answered && question.operation !== '-' && (
          <div className="regroup-hint">
            {question.operation === '+' ? 'Remember to carry' : 'Multiply digit by digit'}
          </div>
        )}
      </div>

      {hintContent && <div className="column-hint">{hintContent}</div>}

      <div className="column-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`column-option ${selectedOption === idx ? 'selected' : ''} ${
              answered ? 'disabled' : ''
            }`}
            onClick={() => handleSelect(idx)}
            disabled={disabled || answered}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
