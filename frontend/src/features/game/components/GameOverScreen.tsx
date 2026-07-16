import { useState, useEffect } from 'react';
import { FinalScore, Player } from '../types/game.types';
import { Trophy, Medal, Award, LogOut, RotateCcw } from 'lucide-react';
import './GameOverScreen.css';

interface GameOverScreenProps {
  scores: FinalScore[];
  players: Player[];
  onPlayAgain?: () => void;
  onExit?: () => void;
}

const RANK_CONFIG: Record<number, { icon: React.ReactNode; className: string }> = {
  1: { icon: <Trophy size={18} />, className: 'rank--gold' },
  2: { icon: <Medal size={18} />, className: 'rank--silver' },
  3: { icon: <Award size={18} />, className: 'rank--bronze' },
};

export function GameOverScreen({ scores, players, onPlayAgain, onExit }: GameOverScreenProps) {
  const [revealStage, setRevealStage] = useState(0);
  // Stages: 0=nothing, 1=header, 2=score table, 3=winner

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
                  <th>Net Worth</th>

                  <th>+ Math</th>
                  <th>Final</th>
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
                            {score.playerName.charAt(0)}
                          </div>
                          <span>{score.playerName}</span>
                        </div>
                      </td>
                      <td className="score-value">${score.netWorth.toLocaleString()}</td>

                      <td className="score-math">+${score.mathBonus}</td>
                      <td className="score-final">${score.finalScore.toLocaleString()}</td>
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
              <p className="winner-score">Final Score: ${winner.finalScore.toLocaleString()}</p>
              <div className="winner-breakdown">
                <span>Net Worth: ${winner.netWorth.toLocaleString()}</span>
                <span>Correct: {winner.totalCorrect} answers</span>
              </div>

            </div>
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
