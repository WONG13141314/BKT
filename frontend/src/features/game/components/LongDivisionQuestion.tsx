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

  const isQuotientMissing = question.missingTarget === 'quotient_digit';
  const isBroughtDownMissing = question.missingTarget === 'brought_down_digit';
  const isSubtractionMissing = question.missingTarget === 'subtraction_result';
  const isRemainderMissing = question.missingTarget === 'remainder';

  return (
    <div className="long-division-question">
      {/* Long Division Box */}
      <div className="division-container">
        {/* Quotient Header Row */}
        <div className="division-quotient-row">
          <span className="divisor-space" />
          <span className="bracket-space" />
          <span className={`quotient-display ${isQuotientMissing && !answered ? 'target-box' : ''}`}>
            {isQuotientMissing && !answered ? '?' : question.quotient}
          </span>
        </div>

        {/* Bracket & Dividend Row */}
        <div className="division-main-row">
          <span className="divisor-val">{question.divisor}</span>
          <span className="division-bracket">)</span>
          <span className="dividend-val">{question.dividend}</span>
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
                  <span className={`step-result ${showSubTarget ? 'target-box' : ''}`}>
                    {showSubTarget ? '?' : step.subtractionResult}
                  </span>
                  {step.broughtDownDigit !== null && (
                    <span className={`brought-down ${showBroughtDownTarget ? 'target-box' : ''}`}>
                      {showBroughtDownTarget ? '?' : step.broughtDownDigit}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Remainder Row if remainder exists */}
          {question.remainder >= 0 && (
            <div className="remainder-row">
              <span className="remainder-label">Remainder:</span>
              <span className={`remainder-val ${isRemainderMissing && !answered ? 'target-box' : ''}`}>
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
