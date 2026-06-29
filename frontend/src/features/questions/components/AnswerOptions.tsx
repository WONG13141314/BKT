// Multiple-choice answer buttons

interface AnswerOptionsProps {
  options: string[];
  onSelect: (index: number) => void;
  disabled: boolean;
}

export function AnswerOptions({ options, onSelect, disabled }: AnswerOptionsProps) {
  return (
    <div className="answer-options">
      {options.map((option, i) => (
        <button key={i} onClick={() => onSelect(i)} disabled={disabled}>
          {option}
        </button>
      ))}
    </div>
  );
}
