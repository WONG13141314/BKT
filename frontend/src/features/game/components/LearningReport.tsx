import type { MasteryReport } from '../types/game.types';
import './LearningReport.css';

export function LearningReport({ report }: { report: MasteryReport }) {
  return (
    <section className="learning-report" aria-labelledby="learning-report-title">
      <header>
        <span>Private to {report.playerName}</span>
        <h2 id="learning-report-title">My Learning Report</h2>
        <p>Accuracy this game: <strong>{Math.round(report.overallAccuracy * 100)}%</strong></p>
      </header>
      <div className="learning-report__skills">
        {report.skills.map((skill) => {
          const percent = Math.round(skill.mastery * 100);
          const status = skill.isMastered ? 'Mastered' : percent >= 50 ? 'Developing' : 'Building';
          return (
            <article key={skill.skillName} className="learning-skill">
              <div className="learning-skill__heading">
                <strong>{skill.skillName}</strong>
                <span>{status} · {percent}%</span>
              </div>
              <div className="learning-skill__track" aria-label={`${skill.skillName} mastery estimate ${percent}%`}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <small>{skill.totalAttempts} question{skill.totalAttempts === 1 ? '' : 's'} answered</small>
            </article>
          );
        })}
      </div>
      <p className="learning-report__next">
        <strong>Next focus:</strong> practise {report.weakestSkill} while keeping {report.bestSkill} fresh.
      </p>
    </section>
  );
}
