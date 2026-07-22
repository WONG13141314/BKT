import { useState } from 'react';
import { ColumnQuestion as ColumnQuestionData } from '../types/game.types';
import './ColumnQuestion.css';

interface Props {
  question: ColumnQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
  disabled?: boolean;
  timeLimit: number;
  hintContent?: string | null;
}

export function ColumnQuestion({ question, options, onAnswer, disabled, timeLimit, hintContent }: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (index: number) => {
    if (disabled || answered) return;
    setSelectedOption(index);
    setAnswered(true);
    onAnswer(index);
  };

  const hasHundreds = question.placeValues.hundreds !== undefined;
  const pos = question.missingPosition || 'answer';
  const place = question.missingDigitPlace;

  // Helper to render top row cells
  const renderTopRow = () => {
    if (pos === 'top_operand' && !answered) {
      return <span className="digit-cell digit-target operand-box">?</span>;
    }
    return (
      <>
        {hasHundreds && (
          <span className={`digit-cell ${pos === 'internal_digit' && place === 'hundreds' && !answered ? 'digit-target' : ''}`}>
            {pos === 'internal_digit' && place === 'hundreds' && !answered ? '?' : (question.placeValues.hundreds?.top ?? '')}
          </span>
        )}
        <span className={`digit-cell ${pos === 'internal_digit' && place === 'tens' && !answered ? 'digit-target' : ''}`}>
          {pos === 'internal_digit' && place === 'tens' && !answered ? '?' : question.placeValues.tens.top}
        </span>
        <span className={`digit-cell ${pos === 'internal_digit' && place === 'ones' && !answered ? 'digit-target' : ''}`}>
          {pos === 'internal_digit' && place === 'ones' && !answered ? '?' : question.placeValues.ones.top}
        </span>
      </>
    );
  };

  // Helper to render bottom row cells
  const renderBottomRow = () => {
    if (pos === 'bottom_operand' && !answered) {
      return <span className="digit-cell digit-target operand-box">?</span>;
    }
    return (
      <>
        {hasHundreds && (
          <span className={`digit-cell ${pos === 'internal_digit' && place === 'hundreds' && !answered ? 'digit-target' : ''}`}>
            {pos === 'internal_digit' && place === 'hundreds' && !answered ? '?' : (question.placeValues.hundreds?.bottom ?? '')}
          </span>
        )}
        <span className={`digit-cell ${pos === 'internal_digit' && place === 'tens' && !answered ? 'digit-target' : ''}`}>
          {pos === 'internal_digit' && place === 'tens' && !answered ? '?' : question.placeValues.tens.bottom}
        </span>
        <span className={`digit-cell ${pos === 'internal_digit' && place === 'ones' && !answered ? 'digit-target' : ''}`}>
          {pos === 'internal_digit' && place === 'ones' && !answered ? '?' : question.placeValues.ones.bottom}
        </span>
      </>
    );
  };

  // Helper to render answer row cells
  const renderAnswerRow = () => {
    if (pos === 'answer' && !answered) {
      return <span className="digit-cell digit-answer digit-target operand-box">?</span>;
    }
    return (
      <>
        {hasHundreds && (
          <span className="digit-cell digit-answer">
            {question.answerDigits.hundreds ?? ''}
          </span>
        )}
        <span className="digit-cell digit-answer">
          {question.answerDigits.tens}
        </span>
        <span className="digit-cell digit-answer">
          {question.answerDigits.ones}
        </span>
      </>
    );
  };

  return (
    <div className="column-question">
      {/* Column/Vertical Layout */}
      <div className="column-stack">
        {/* Place value labels */}
        <div className="column-row column-labels">
          {hasHundreds && <span className="place-label">H</span>}
          <span className="place-label">T</span>
          <span className="place-label">O</span>
        </div>

        {/* Top number */}
        <div className="column-row column-top">
          <span className="operation-space" />
          {renderTopRow()}
        </div>

        {/* Bottom number with operation */}
        <div className="column-row column-bottom">
          <span className="operation-symbol">{question.operation}</span>
          {renderBottomRow()}
        </div>

        {/* Separator line */}
        <div className="column-line" />

        {/* Answer row */}
        <div className="column-row column-answer">
          <span className="operation-space" />
          {renderAnswerRow()}
        </div>

        {/* Regrouping indicator */}
        {question.hasRegrouping && !answered && (
          <div className="regroup-hint">
            {question.operation === '+' ? '↑ Remember to carry!' : question.operation === '-' ? '↓ Remember to borrow!' : '× Multiply digit by digit!'}
          </div>
        )}
      </div>

      {/* Hint */}
      {hintContent && (
        <div className="column-hint">{hintContent}</div>
      )}

      {/* MCQ Options */}
      <div className="column-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`column-option ${
              selectedOption === idx ? 'selected' : ''
            } ${answered ? 'disabled' : ''}`}
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
