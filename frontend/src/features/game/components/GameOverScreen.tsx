import { useState, useEffect } from 'react';
import { FinalScore, MasteryReport, Player, SKILL_NAMES, formatRM } from '../types/game.types';
import { Trophy, Medal, Award, LogOut, RotateCcw, BarChart3 } from 'lucide-react';
import './GameOverScreen.css';

interface GameOverScreenProps {
  scores: FinalScore[];
  players: Player[];
  masteryReports?: MasteryReport[] | null;
  onPlayAgain?: () => void;
  onExit?: () => void;
}

const RANK_CONFIG: Record<number, { icon: React.ReactNode; className: string }> = {
  1: { icon: <Trophy size={18} />, className: 'rank--gold' },
  2: { icon: <Medal size={18} />, className: 'rank--silver' },
  3: { icon: <Award size={18} />, className: 'rank--bronze' },
};

export function GameOverScreen({ scores, players, masteryReports, onPlayAgain, onExit }: GameOverScreenProps) {
  const [revealStage, setRevealStage] = useState(0);
  const [showMastery, setShowMastery] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setRevealStage(1), 300),
      setTimeout(() => setRevealStage(2), 800),
      setTimeout(() => setRevealStage(3), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const winner = scores[0];
  const sortedScores = [...scores].sort((a, b) => a.rank - b.rank);

  return (
    <div className="gameover-overlay">
      <div className="gameover-container">
        {/* Stage 1: Header */}
        {revealStage >= 1 && (
          <div className="gameover-header gameover-reveal">
            <h1 className="heading-display gameover-title">Game Over</h1>
            <p className="gameover-subtitle">Final scores are in...</p>
          </div>
        )}

        {/* Stage 2: Score Table */}
        {revealStage >= 2 && (
          <div className="gameover-scores gameover-reveal">
            <table className="score-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Cash</th>
                  <th>Properties</th>
                  <th>Net Worth</th>
                </tr>
              </thead>
              <tbody>
                {sortedScores.map((score, idx) => {
                  const rankConfig = RANK_CONFIG[score.rank];
                  return (
                    <tr
                      key={score.playerId}
                      className={`score-row ${score.rank === 1 ? 'score-row--winner' : ''}`}
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <td className="score-rank">
                        {rankConfig ? (
                          <span className={`rank-icon ${rankConfig.className}`}>
                            {rankConfig.icon}
                          </span>
                        ) : (
                          <span className="rank-number">{score.rank}</span>
                        )}
                      </td>
                      <td>
                        <div className="score-player">
                          <div
                            className="score-player__avatar"
                            style={{ backgroundColor: score.color }}
                          >
                            {score.isBot ? '🤖' : score.playerName.charAt(0)}
                          </div>
                          <span>
                            {score.playerName}
                            {score.isBot && <span className="bot-label"> (Bot)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="score-value">{formatRM(score.cash)}</td>
                      <td className="score-value">{formatRM(score.propertyValue + score.levelUpValue)}</td>
                      <td className="score-final">{formatRM(score.netWorth)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Stage 3: Winner Announcement */}
        {revealStage >= 3 && winner && (
          <div className="gameover-winner gameover-reveal">
            <div className="winner-card surface-2">
              <span className="winner-trophy"><Trophy size={32} /></span>
              <h2 className="heading-display winner-name">{winner.playerName} Wins!</h2>
              <p className="winner-score">Net Worth: {formatRM(winner.netWorth)}</p>
              <div className="winner-breakdown">
                <span>Cash: {formatRM(winner.cash)}</span>
                <span>Correct: {winner.totalCorrect} answers</span>
              </div>
            </div>
          </div>
        )}

        {/* Mastery Report Toggle */}
        {revealStage >= 3 && masteryReports && masteryReports.length > 0 && (
          <div className="gameover-mastery gameover-reveal">
            <button
              className="mastery-toggle"
              onClick={() => setShowMastery(!showMastery)}
            >
              <BarChart3 size={16} />
              {showMastery ? 'Hide' : 'Show'} Learning Report
            </button>

            {showMastery && (
              <div className="mastery-reports">
                {masteryReports.map((report) => (
                  <div key={report.playerId} className="mastery-card">
                    <h4 className="mastery-player">{report.playerName}</h4>
                    <div className="mastery-skills">
                      {report.skills.map((skill) => (
                        <div key={skill.skillName} className="mastery-bar">
                          <span className="mastery-label">{skill.skillName}</span>
                          <div className="mastery-track">
                            <div
                              className="mastery-fill"
                              style={{ width: `${Math.round(skill.mastery * 100)}%` }}
                            />
                          </div>
                          <span className="mastery-pct">{Math.round(skill.mastery * 100)}%</span>
                        </div>
                      ))}
                    </div>
                    <p className="mastery-summary">
                      Best: {report.bestSkill} · Needs work: {report.weakestSkill} · 
                      Accuracy: {Math.round(report.overallAccuracy * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {revealStage >= 3 && (
          <div className="gameover-actions gameover-reveal">
            {onPlayAgain && (
              <button className="gameover-btn gameover-btn--primary" onClick={onPlayAgain}>
                <RotateCcw size={16} />
                Play Again
              </button>
            )}
            {onExit && (
              <button className="gameover-btn gameover-btn--secondary" onClick={onExit}>
                <LogOut size={16} />
                Exit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
