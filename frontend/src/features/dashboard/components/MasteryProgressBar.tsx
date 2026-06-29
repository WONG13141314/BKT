// Per-skill mastery progress bar

interface MasteryProgressBarProps {
  skillName: string;
  mastery: number; // 0 to 1
}

export function MasteryProgressBar({ skillName, mastery }: MasteryProgressBarProps) {
  return (
    <div className="mastery-progress-bar">
      <span>{skillName}</span>
      <div className="bar">
        <div className="fill" style={{ width: `${mastery * 100}%` }} />
      </div>
      <span>{Math.round(mastery * 100)}%</span>
    </div>
  );
}
