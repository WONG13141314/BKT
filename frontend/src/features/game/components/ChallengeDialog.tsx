import { ReactNode, useId, useRef } from 'react';
import { useDialogFocus } from '../../../shared/hooks/useDialogFocus';
import './ChallengeDialog.css';

interface ChallengeDialogProps {
  title: string;
  children: ReactNode;
  feedback?: string | null;
  onSafeClose?: () => void;
}

export function ChallengeDialog({ title, children, feedback, onSafeClose }: ChallengeDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, dialogRef, onSafeClose);

  return (
    <div className="challenge-dialog-overlay">
      <section
        ref={dialogRef}
        className="challenge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="challenge-dialog__header">
          <span className="challenge-dialog__eyebrow">Primary Math</span>
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="challenge-dialog__body">{children}</div>
        {feedback && <div role="status" className="challenge-dialog__feedback">{feedback}</div>}
      </section>
    </div>
  );
}
