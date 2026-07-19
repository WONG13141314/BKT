import { useState } from 'react';
import { McqQuestion as McqQuestionData } from '../types/game.types';
import './ColumnQuestion.css'; // Reuse option styling

interface Props {
  question: McqQuestionData;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
  disabled?: boolean;
  timeLimit: number;
  hintContent?: string | null;
}

export function McqQuestion({ question, options, onAnswer, disabled, timeLimit, hintContent }: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (index: number) => {
    if (disabled || answered) return;
    setSelectedOption(index);
    setAnswered(true);
    onAnswer(index);
  };

  return (
    <div className="column-question">
      {/* Question text */}
      <div className="mcq-text">{question.text}</div>

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
