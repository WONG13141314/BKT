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
          {hasHundreds && (
            <span className="digit-cell">
              {question.placeValues.hundreds?.top ?? ''}
            </span>
          )}
          <span className="digit-cell">{question.placeValues.tens.top}</span>
          <span className="digit-cell">{question.placeValues.ones.top}</span>
        </div>

        {/* Bottom number with operation */}
        <div className="column-row column-bottom">
          <span className="operation-symbol">{question.operation}</span>
          {hasHundreds && (
            <span className="digit-cell">
              {question.placeValues.hundreds?.bottom ?? ''}
            </span>
          )}
          <span className="digit-cell">{question.placeValues.tens.bottom}</span>
          <span className="digit-cell">{question.placeValues.ones.bottom}</span>
        </div>

        {/* Separator line */}
        <div className="column-line" />

        {/* Answer row — shows ? until answered */}
        <div className="column-row column-answer">
          <span className="operation-space" />
          {hasHundreds && (
            <span className="digit-cell digit-answer">
              {answered ? (question.answerDigits.hundreds ?? '') : '?'}
            </span>
          )}
          <span className="digit-cell digit-answer">
            {answered ? question.answerDigits.tens : '?'}
          </span>
          <span className="digit-cell digit-answer">
            {answered ? question.answerDigits.ones : '?'}
          </span>
        </div>

        {/* Regrouping indicator */}
        {question.hasRegrouping && !answered && (
          <div className="regroup-hint">
            {question.operation === '+' ? '↑ Remember to carry!' : '↓ Remember to borrow!'}
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
