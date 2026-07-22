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
  const quotientStr = String(question.quotient).padStart(dividendStr.length, ' ');
  const dividendDigits = dividendStr.split('');
  const quotientDigits = quotientStr.split('');

  const isQuotientMissing = question.missingTarget === 'quotient_digit';
  const targetQuotientIdx = quotientDigits.length - 1;

  const isBroughtDownMissing = question.missingTarget === 'brought_down_digit';
  const isSubtractionMissing = question.missingTarget === 'subtraction_result';
  const isRemainderMissing = question.missingTarget === 'remainder';

  return (
    <div className="long-division-question">
      {/* Question Prompt Header */}
      <div className="division-header-title">
        {question.dividend} ÷ {question.divisor} = ?
      </div>

      {/* Long Division Box */}
      <div className="division-container">
        {/* Quotient Header Row */}
        <div className="division-row division-quotient-row">
          <span className="div-cell cell-empty" /> {/* Divisor space */}
          <span className="div-cell cell-empty" /> {/* Bracket space */}
          <div className="digits-grid">
            {quotientDigits.map((qChar, idx) => {
              const isTargetDigit = isQuotientMissing && !answered && idx === targetQuotientIdx;
              return (
                <span key={idx} className={`div-cell ${isTargetDigit ? 'div-target' : ''}`}>
                  {isTargetDigit ? '?' : qChar === ' ' ? '' : qChar}
                </span>
              );
            })}
          </div>
        </div>

        {/* Divisor + Bracket + Dividend Row */}
        <div className="division-row division-main-row">
          <span className="div-cell divisor-val">{question.divisor}</span>
          <span className="div-cell division-bracket">)</span>
          <div className="digits-grid dividend-bar">
            {dividendDigits.map((dChar, idx) => (
              <span key={idx} className="div-cell dividend-val">{dChar}</span>
            ))}
          </div>
        </div>

        {/* Step-by-Step Subtractions */}
        <div className="division-steps">
          {question.steps.map((step, idx) => {
            const showBroughtDownTarget = isBroughtDownMissing && idx === (question.missingStepIndex ?? 0) && !answered;
            const showSubTarget = isSubtractionMissing && idx === (question.missingStepIndex ?? 0) && !answered;

            return (
              <div key={idx} className="step-block">
                <div className="step-sub-row">
                  <span className="step-minus">-</span>
                  <span className="step-val">{step.product}</span>
                </div>
                <div className="step-line" />
                <div className="step-result-row">
                  <span className={`step-result ${showSubTarget ? 'div-target' : ''}`}>
                    {showSubTarget ? '?' : step.subtractionResult}
                  </span>
                  {step.broughtDownDigit !== null && (
                    <span className={`brought-down ${showBroughtDownTarget ? 'div-target' : ''}`}>
                      {showBroughtDownTarget ? '?' : step.broughtDownDigit}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Remainder Row */}
          {(question.remainder > 0 || isRemainderMissing) && (
            <div className="remainder-row">
              <span className="remainder-label">Remainder:</span>
              <span className={`remainder-val ${isRemainderMissing && !answered ? 'div-target' : ''}`}>
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
