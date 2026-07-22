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

  // Helper to render top digit cell
  const renderTopCell = (digit: number | null | undefined, cellPlace: 'hundreds' | 'tens' | 'ones') => {
    if (pos === 'top_operand' && !answered) return <span className="digit-cell digit-target">?</span>;
    if (pos === 'internal_digit' && place === cellPlace && !answered) return <span className="digit-cell digit-target">?</span>;
    return <span className="digit-cell">{digit ?? ''}</span>;
  };

  // Helper to render bottom digit cell
  const renderBottomCell = (digit: number | null | undefined, cellPlace: 'hundreds' | 'tens' | 'ones') => {
    if (pos === 'bottom_operand' && !answered) return <span className="digit-cell digit-target">?</span>;
    if (pos === 'internal_digit' && place === cellPlace && !answered) return <span className="digit-cell digit-target">?</span>;
    return <span className="digit-cell">{digit ?? ''}</span>;
  };

  // Helper to render answer digit cell
  const renderAnswerCell = (digit: number | null | undefined, cellPlace: 'hundreds' | 'tens' | 'ones') => {
    if (pos === 'answer' && !answered) return <span className="digit-cell digit-answer digit-target">?</span>;
    if (pos === 'internal_digit' && place === cellPlace && !answered) return <span className="digit-cell digit-answer digit-target">?</span>;
    return <span className="digit-cell digit-answer">{digit ?? ''}</span>;
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
          {hasHundreds && renderTopCell(question.placeValues.hundreds?.top, 'hundreds')}
          {renderTopCell(question.placeValues.tens.top, 'tens')}
          {renderTopCell(question.placeValues.ones.top, 'ones')}
        </div>

        {/* Bottom number with operation */}
        <div className="column-row column-bottom">
          <span className="operation-symbol">{question.operation}</span>
          {hasHundreds && renderBottomCell(question.placeValues.hundreds?.bottom, 'hundreds')}
          {renderBottomCell(question.placeValues.tens.bottom, 'tens')}
          {renderBottomCell(question.placeValues.ones.bottom, 'ones')}
        </div>

        {/* Separator line */}
        <div className="column-line" />

        {/* Answer row */}
        <div className="column-row column-answer">
          <span className="operation-space" />
          {hasHundreds && renderAnswerCell(question.answerDigits.hundreds, 'hundreds')}
          {renderAnswerCell(question.answerDigits.tens, 'tens')}
          {renderAnswerCell(question.answerDigits.ones, 'ones')}
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
