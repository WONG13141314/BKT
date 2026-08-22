import { FinalScore, MasteryReport, formatRM } from '../types/game.types';
import { Trophy, Medal, Award, LogOut, RotateCcw } from 'lucide-react';
import { LearningReport } from './LearningReport';
import './GameOverScreen.css';

interface GameOverScreenProps {
  scores: FinalScore[];
  masteryReport?: MasteryReport | null;
  onPlayAgain?: () => void;
  onExit?: () => void;
}

const RANK_CONFIG: Record<number, { icon: React.ReactNode; className: string }> = {
  1: { icon: <Trophy size={18} />, className: 'rank--gold' },
  2: { icon: <Medal size={18} />, className: 'rank--silver' },
  3: { icon: <Award size={18} />, className: 'rank--bronze' },
};

export function GameOverScreen({ scores, masteryReport, onPlayAgain, onExit }: GameOverScreenProps) {
  const winner = scores[0];
  const sortedScores = [...scores].sort((a, b) => a.rank - b.rank);

  return (
    <div className="gameover-overlay">
      <div className="gameover-container">
          <div className="gameover-header">
            <h1 className="heading-display gameover-title">Game Over</h1>
            <p className="gameover-subtitle">Final scores</p>
          </div>

        {/* Stage 2: Score Table */}
          <div className="gameover-scores">
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

        {/* Stage 3: Winner Announcement */}
        {winner && (
          <div className="gameover-winner">
            <div className="winner-card">
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

        {masteryReport && <LearningReport report={masteryReport} />}

        {/* Action Buttons */}
          <div className="gameover-actions">
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
      </div>
    </div>
  );
}
