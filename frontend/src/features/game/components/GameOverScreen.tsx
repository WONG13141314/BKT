import { useState, useEffect } from 'react';
import { FinalScore, Player, SKILL_NAMES } from '../types/game.types';
import { Trophy, Medal, Award, TrendingUp, LogOut, RotateCcw } from 'lucide-react';
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
  // Stages: 0=nothing, 1=header, 2=score table, 3=winner, 4=mastery summary

  useEffect(() => {
    const timers = [
      setTimeout(() => setRevealStage(1), 300),
      setTimeout(() => setRevealStage(2), 800),
      setTimeout(() => setRevealStage(3), 2000),
      setTimeout(() => setRevealStage(4), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const winner = scores[0];
  const sortedScores = [...scores].sort((a, b) => a.rank - b.rank);

  // Find top improved skill for winner
  const winnerPlayer = players.find(p => p.id === winner?.playerId);
  const topSkill = winnerPlayer ? (() => {
    let best = { name: '', val: 0 };
    SKILL_NAMES.forEach(skill => {
      const val = winnerPlayer.masteryStates[skill] ?? 0;
      if (val > best.val) best = { name: skill, val };
    });
    return best.name;
  })() : '';

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
                  <th>× Mastery</th>
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
                      <td className="score-multiplier">×{score.masteryMultiplier.toFixed(2)}</td>
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
                <span>Mastery: {Math.round(winner.averageMastery * 100)}%</span>
                <span>Correct: {winner.totalCorrect} answers</span>
              </div>
              {topSkill && (
                <p className="winner-highlight">
                  <TrendingUp size={14} />
                  Strongest skill: {topSkill}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Stage 4: Mastery Summary */}
        {revealStage >= 4 && (
          <div className="gameover-mastery gameover-reveal">
            <h3 className="heading-display mastery-title">Skills Journey</h3>
            <div className="mastery-grid">
              {players.map((player) => (
                <div key={player.id} className="mastery-player-card surface-2">
                  <div className="mastery-player-header">
                    <div
                      className="mastery-player-dot"
                      style={{ backgroundColor: player.color }}
                    />
                    <span>{player.name}</span>
                  </div>
                  {SKILL_NAMES.map((skill) => {
                    const mastery = player.masteryStates[skill] ?? 0.1;
                    const pct = Math.round(mastery * 100);
                    return (
                      <div key={skill} className="mastery-skill-row">
                        <span className="mastery-skill-name">{skill}</span>
                        <div className="mastery-skill-bar">
                          <div
                            className="mastery-skill-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="mastery-skill-pct">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {revealStage >= 4 && (
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
