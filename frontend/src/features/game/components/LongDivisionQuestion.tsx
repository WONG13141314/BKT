import { useState } from 'react';
import { DigitCell, LongDivisionQuestion as LongDivisionQuestionData } from '../types/game.types';
import { ChallengeTimer } from './ChallengeTimer';
import './LongDivisionQuestion.css';

interface Props {
  question: LongDivisionQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
  disabled?: boolean;
  expiresAt: number;
  timeLimit: number;
  hintContent?: string | null;
  revealedAnswer?: string | null;
}

/**
 * Renders the long-division staircase.
 *
 * All layout is computed server-side and arrives as padded cell arrays, because
 * the visible work has to stop exactly at the step the player must complete —
 * any row below it can be solved backwards to recover the hidden value.
 */
export function LongDivisionQuestion({
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

  const cellContent = (cell: DigitCell) =>
    cell === '?' && revealedAnswer ? revealedAnswer : cell;

  const renderRow = (cells: DigitCell[], keyPrefix: string, extraClass = '') =>
    cells.map((cell, col) => (
      <span
        key={`${keyPrefix}-${col}`}
        className={`ld-cell ${extraClass} ${cell === '?' ? 'ld-target' : ''}`}
      >
        {cellContent(cell)}
      </span>
    ));

  return (
    <div className="long-division-question">
      <ChallengeTimer expiresAt={expiresAt} totalSeconds={timeLimit} paused={answered} />

      <div className="ld-container">
        {/* Quotient sits above the dividend, one digit per column */}
        <div className="ld-row ld-quotient-row">
          <span className="ld-cell" />
          {renderRow(question.quotientCells, 'q', 'ld-quotient-digit')}
        </div>

        {/* Divisor, division house, dividend */}
        <div className="ld-row ld-dividend-row">
          <span className="ld-cell ld-divisor">{question.divisor}</span>
          <svg className="ld-house-bracket" viewBox="0 0 12 34" aria-hidden="true">
            <path
              d="M 2 32 C 9 23 9 9 2 1.5 L 12 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {question.dividendCells.map((digit, col) => (
            <span key={`d-${col}`} className="ld-cell ld-dividend-digit">
              {digit}
            </span>
          ))}
        </div>

        {/* Staircase — only the steps the player has reached */}
        <div className="ld-steps">
          {question.steps.map((step, idx) => (
            <div key={`step-${idx}`} className="ld-step">
              <div className="ld-row ld-product-row">
                <span className="ld-cell ld-minus">{step.showMinus ? '−' : ''}</span>
                {renderRow(step.productCells, `p${idx}`, 'ld-step-digit')}
              </div>

              <div className="ld-row ld-step-line-row">
                <span className="ld-cell" />
                {step.productCells.map((_, col) => (
                  <span
                    key={`l${idx}-${col}`}
                    className={`ld-cell ${
                      col >= step.lineFrom && col <= step.lineTo ? 'ld-line-cell' : ''
                    }`}
                  />
                ))}
              </div>

              {step.resultCells && (
                <div className="ld-row ld-result-row">
                  <span className="ld-cell" />
                  {renderRow(step.resultCells, `r${idx}`, 'ld-step-digit')}
                </div>
              )}
            </div>
          ))}

          {question.remainderCell !== null && (
            <div className="ld-remainder-row">
              <span className="ld-remainder-label">Remainder</span>
              <span
                className={`ld-remainder-val ${
                  question.remainderCell === '?' ? 'ld-target' : ''
                }`}
              >
                {cellContent(question.remainderCell)}
              </span>
            </div>
          )}
        </div>
      </div>

      {hintContent && <div className="division-hint">{hintContent}</div>}

      <div className="division-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`division-option ${selectedOption === idx ? 'selected' : ''} ${
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
