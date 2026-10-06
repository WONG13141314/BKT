import { useState } from 'react';
import { ChallengeHint, ColumnQuestion as ColumnQuestionData, DigitCell, HintHighlight } from '../types/game.types';
import { ChallengeTimer } from './ChallengeTimer';
import { QuestionHelp, isHintHighlighted } from './QuestionHelp';
import { useChallengeDeadline } from '../hooks/useChallengeDeadline';
import './ColumnQuestion.css';

interface Props {
  question: ColumnQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => boolean | void;
  disabled?: boolean;
  expiresAt: number;
  timeLimit: number;
  hint?: ChallengeHint | null;
  onRequestHint?: () => Promise<void>;
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
  hint,
  onRequestHint,
  revealedAnswer,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const expired = useChallengeDeadline(expiresAt, timeLimit);

  const handleSelect = (index: number) => {
    if (disabled || answered || (timeLimit > 0 && Date.now() >= expiresAt)) return;
    if (onAnswer(index) === false) return;
    setSelectedOption(index);
    setAnswered(true);
  };

  const renderCells = (cells: DigitCell[], rowLabel: HintHighlight['row']) =>
    cells.map((cell, i) => {
      const isTarget = cell === '?';
      const content = isTarget && revealedAnswer ? revealedAnswer : cell;
      return (
        <span
          key={`${rowLabel}-${i}`}
          className={`digit-cell ${cell !== '' && isHintHighlighted(hint, rowLabel, i) ? 'question-hint-highlight' : ''} ${isTarget ? 'digit-target' : ''} ${
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
      </div>

      <QuestionHelp hint={hint} onRequestHint={onRequestHint}
        disabled={!!disabled || answered || expired} expiresAt={expiresAt} timeLimit={timeLimit} />

      <div className="column-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`column-option ${selectedOption === idx ? 'selected' : ''} ${
              answered || expired ? 'disabled' : ''
            }`}
            onClick={() => handleSelect(idx)}
            disabled={disabled || answered || expired}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
