import { useState } from 'react';
import { LongDivisionQuestion as LongDivisionQuestionData } from '../types/game.types';
import './LongDivisionQuestion.css';

interface Props {
  question: LongDivisionQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
  disabled?: boolean;
  timeLimit: number;
  hintContent?: string | null;
}

/** Split a number into an array of its individual digits */
function digitize(n: number): number[] {
  return String(n).split('').map(Number);
}

export function LongDivisionQuestion({ question, options, onAnswer, disabled, timeLimit, hintContent }: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (index: number) => {
    if (disabled || answered) return;
    setSelectedOption(index);
    setAnswered(true);
    onAnswer(index);
  };

  const dividendStr = String(question.dividend);
  const numDigits = dividendStr.length;
  const dividendDigits = dividendStr.split('').map(Number);

  // Pad quotient to match dividend digit count (left-pad with spaces)
  const quotientStr = String(question.quotient).padStart(numDigits, ' ');
  const quotientChars = quotientStr.split('');

  // Divisor digits for sizing
  const divisorStr = String(question.divisor);

  const isQuotientMissing = question.missingTarget === 'quotient_digit';
  const targetQuotientIdx = quotientChars.length - 1;
  const isBroughtDownMissing = question.missingTarget === 'brought_down_digit';
  const isSubtractionMissing = question.missingTarget === 'subtraction_result';
  const isRemainderMissing = question.missingTarget === 'remainder';

  // Build step rows for the staircase layout.
  // Each step `i` operates on digit position `i` of the dividend.
  // The product is subtracted from a value that spans columns [startCol..startCol+width-1].
  // The result may span fewer or same columns.
  // The brought-down digit is at column (startCol + width) = next dividend digit position.
  const stepRows: React.ReactNode[] = [];

  for (let idx = 0; idx < question.steps.length; idx++) {
    const step = question.steps[idx];
    const showBroughtDownTarget = isBroughtDownMissing && idx === (question.missingStepIndex ?? 0) && !answered;
    const showSubTarget = isSubtractionMissing && idx === (question.missingStepIndex ?? 0) && !answered;

    // Product row: the product aligns to the right of the current working position.
    // For step i, the rightmost digit of the product aligns with dividend column i.
    const productDigits = digitize(step.product);
    const productEndCol = idx; // 0-indexed dividend column this step processes
    const productStartCol = productEndCol - productDigits.length + 1;

    // Build the subtraction (product) row with minus sign and digits
    const productCells: React.ReactNode[] = [];
    for (let col = -1; col < numDigits; col++) {
      if (col === -1) {
        // Minus sign column — only show minus if product > 0
        productCells.push(
          <span key="minus" className="ld-cell ld-minus">
            {step.product > 0 ? '−' : ''}
          </span>
        );
      } else {
        const digitIdx = col - Math.max(0, productStartCol);
        if (col >= Math.max(0, productStartCol) && col <= productEndCol && digitIdx >= 0 && digitIdx < productDigits.length) {
          productCells.push(
            <span key={col} className="ld-cell ld-step-digit">
              {productDigits[digitIdx]}
            </span>
          );
        } else {
          productCells.push(<span key={col} className="ld-cell" />);
        }
      }
    }

    // Build the line — spans from startCol to endCol
    const lineCells: React.ReactNode[] = [];
    for (let col = -1; col < numDigits; col++) {
      if (col >= Math.max(0, productStartCol) && col <= productEndCol) {
        lineCells.push(<span key={col} className="ld-cell ld-line-cell" />);
      } else {
        lineCells.push(<span key={col} className="ld-cell" />);
      }
    }

    // Build the result row: subtractionResult + optional broughtDownDigit
    const subResultDigits = digitize(step.subtractionResult);
    // The subtraction result right-aligns to productEndCol
    const subResultEndCol = productEndCol;
    const subResultStartCol = subResultEndCol - subResultDigits.length + 1;
    // If the result is 0, it occupies just one column at subResultEndCol
    const broughtDownCol = productEndCol + 1;

    const resultCells: React.ReactNode[] = [];
    for (let col = -1; col < numDigits; col++) {
      if (col === -1) {
        resultCells.push(<span key="space" className="ld-cell" />);
      } else if (col >= Math.max(0, subResultStartCol) && col <= subResultEndCol) {
        const dIdx = col - Math.max(0, subResultStartCol);
        if (showSubTarget) {
          // Show ? for the entire subtraction result
          if (col === subResultEndCol) {
            resultCells.push(
              <span key={col} className="ld-cell ld-step-digit ld-target">?</span>
            );
          } else if (dIdx < subResultDigits.length - 1) {
            // For multi-digit subtraction results, show ? only at the last position
            resultCells.push(<span key={col} className="ld-cell" />);
          } else {
            resultCells.push(<span key={col} className="ld-cell" />);
          }
        } else {
          resultCells.push(
            <span key={col} className="ld-cell ld-step-digit">
              {subResultDigits[dIdx]}
            </span>
          );
        }
      } else if (col === broughtDownCol && step.broughtDownDigit !== null) {
        resultCells.push(
          <span key={col} className={`ld-cell ld-step-digit ld-brought-down ${showBroughtDownTarget ? 'ld-target' : ''}`}>
            {showBroughtDownTarget ? '?' : step.broughtDownDigit}
          </span>
        );
      } else {
        resultCells.push(<span key={col} className="ld-cell" />);
      }
    }

    stepRows.push(
      <div key={`product-${idx}`} className="ld-row ld-product-row">
        {productCells}
      </div>
    );
    stepRows.push(
      <div key={`line-${idx}`} className="ld-row ld-step-line-row">
        {lineCells}
      </div>
    );
    stepRows.push(
      <div key={`result-${idx}`} className="ld-row ld-result-row">
        {resultCells}
      </div>
    );
  }

  return (
    <div className="long-division-question">
      {/* Question Prompt Header */}
      <div className="division-header-title">
        {question.dividend} ÷ {question.divisor} = ?
      </div>

      {/* Long Division Box */}
      <div className="ld-container">
        {/* Quotient Row */}
        <div className="ld-row ld-quotient-row">
          {/* Empty cell for divisor space */}
          <span className="ld-cell" />
          {quotientChars.map((qChar, idx) => {
            const isTargetDigit = isQuotientMissing && !answered && idx === targetQuotientIdx;
            return (
              <span key={idx} className={`ld-cell ld-quotient-digit ${isTargetDigit ? 'ld-target' : ''}`}>
                {isTargetDigit ? '?' : qChar === ' ' ? '' : qChar}
              </span>
            );
          })}
        </div>

        {/* Divisor + Division House + Dividend Row */}
        <div className="ld-row ld-dividend-row">
          <span className="ld-cell ld-divisor">{question.divisor}</span>
          <svg className="ld-house-bracket" viewBox="0 0 10 34" aria-hidden="true">
            <path
              d="M 8 32 C 1 23 1 9 8 1.5 L 10 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {dividendDigits.map((dChar, idx) => (
            <span key={idx} className="ld-cell ld-dividend-digit">
              {dChar}
            </span>
          ))}
        </div>

        {/* Step-by-Step Subtractions (staircase) */}
        <div className="ld-steps">
          {stepRows}

          {/* Remainder Row */}
          {(question.remainder > 0 || isRemainderMissing) && (
            <div className="ld-remainder-row">
              <span className="ld-remainder-label">Remainder:</span>
              <span className={`ld-remainder-val ${isRemainderMissing && !answered ? 'ld-target' : ''}`}>
                {isRemainderMissing && !answered ? '?' : question.remainder}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hint */}
      {hintContent && (
        <div className="division-hint">{hintContent}</div>
      )}

      {/* Options */}
      <div className="division-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`division-option ${selectedOption === idx ? 'selected' : ''} ${answered ? 'disabled' : ''}`}
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
