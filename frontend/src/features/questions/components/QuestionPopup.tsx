import { useState, useEffect, useCallback } from 'react';
import { MathChallenge, AnswerResult, ChallengeContext } from '../../game/types/game.types';
import {
  Dices, Home, Banknote, Hammer, Building, HelpCircle, Gift, Coins,
  KeyRound, Rocket, Brain, Handshake, Megaphone, Star, Swords, HeartPulse,
  CheckCircle2, XCircle, Flame, Trophy, ArrowRight, Lightbulb
} from 'lucide-react';
import './QuestionPopup.css';

interface QuestionPopupProps {
  challenge: MathChallenge;
  onAnswer: (selectedIndex: number, timeMs: number) => void;
  answerResult: AnswerResult | null;
  onContinue: () => void;
}

// Context-to-config mapping
const CONTEXT_CONFIG: Record<ChallengeContext, { icon: React.ReactNode; label: string }> = {
  ROLL_DICE: { icon: <Dices size={16} />, label: 'Dice Power-Up' },
  BUY_PROPERTY: { icon: <Home size={16} />, label: 'Purchase Challenge' },
  PAY_RENT: { icon: <Banknote size={16} />, label: 'Rent Calculation' },
  BUILD_HOUSE: { icon: <Hammer size={16} />, label: 'Building Permit' },
  BUILD_HOTEL: { icon: <Building size={16} />, label: 'Hotel Upgrade' },
  CHANCE_CARD: { icon: <HelpCircle size={16} />, label: 'Chance Challenge' },
  COMMUNITY_CHEST: { icon: <Gift size={16} />, label: 'Community Challenge' },
  TAX: { icon: <Coins size={16} />, label: 'Tax Calculation' },
  JAIL_ESCAPE: { icon: <KeyRound size={16} />, label: 'Jail Escape' },
  PASSING_GO: { icon: <Rocket size={16} />, label: 'Salary Bonus' },
  FREE_PARKING: { icon: <Brain size={16} />, label: 'Knowledge Boost' },
  TRADE: { icon: <Handshake size={16} />, label: 'Trade Verification' },
  AUCTION: { icon: <Megaphone size={16} />, label: 'Auction Speed' },
  SPECIAL_EVENT: { icon: <Star size={16} />, label: 'Special Event' },
  MATH_DUEL: { icon: <Swords size={16} />, label: 'Math Duel' },
  RECOVERY: { icon: <HeartPulse size={16} />, label: 'Recovery Round' },
};

export function QuestionPopup({
  challenge,
  onAnswer,
  answerResult,
  onContinue,
}: QuestionPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(challenge.timeLimit);
  const [startTime] = useState(Date.now());
  const [isAnswered, setIsAnswered] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (isAnswered) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-submit as wrong when time runs out
          clearInterval(interval);
          handleAutoTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAnswered]);

  const handleAutoTimeout = useCallback(() => {
    if (!isAnswered) {
      setIsAnswered(true);
      onAnswer(-1, challenge.timeLimit * 1000); // -1 = timeout
    }
  }, [isAnswered, onAnswer, challenge.timeLimit]);

  const handleSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedIndex(index);
    setIsAnswered(true);
    const timeMs = Date.now() - startTime;
    onAnswer(index, timeMs);
  };

  const contextConfig = CONTEXT_CONFIG[challenge.context] || { icon: <Brain size={16} />, label: 'Math Challenge' };

  // Difficulty as graduated dots
  const difficultyLevel = challenge.difficulty;

  // Timer ring calculation
  const timerPercent = timeLeft / challenge.timeLimit;
  const circumference = 2 * Math.PI * 18; // radius=18
  const strokeDashoffset = circumference * (1 - timerPercent);
  const timerColor = timeLeft > 5 ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div className="quiz-overlay">
      <div className={`quiz-panel ${isAnswered ? 'quiz-panel--answered' : ''}`}>
        {/* Header */}
        <div className="quiz-header">
          <div className="quiz-context">
            {contextConfig.icon}
            <span>{contextConfig.label}</span>
          </div>
          <div className="quiz-meta">
            {/* Difficulty dots */}
            <div className="quiz-difficulty" title={`Difficulty ${difficultyLevel}/3`}>
              {[1, 2, 3].map((level) => (
                <span
                  key={level}
                  className={`quiz-diff-dot ${level <= difficultyLevel ? 'quiz-diff-dot--active' : ''}`}
                />
              ))}
            </div>
            <span className="quiz-skill">{challenge.skillName}</span>
          </div>
        </div>

        {/* Circular Timer */}
        {!isAnswered && (
          <div className="quiz-timer">
            <svg className="quiz-timer-ring" viewBox="0 0 44 44">
              <circle
                className="quiz-timer-bg"
                cx="22" cy="22" r="18"
                fill="none"
                strokeWidth="3"
              />
              <circle
                className="quiz-timer-fill"
                cx="22" cy="22" r="18"
                fill="none"
                strokeWidth="3"
                style={{
                  stroke: timerColor,
                  strokeDasharray: circumference,
                  strokeDashoffset: strokeDashoffset,
                }}
              />
            </svg>
            <span className="quiz-timer-text">{timeLeft}</span>
          </div>
        )}

        {/* Hint */}
        {challenge.hintContent && !isAnswered && (
          <div className="quiz-hint">
            <Lightbulb size={14} />
            <span>{challenge.hintContent}</span>
          </div>
        )}

        {/* Question Text */}
        <div className="quiz-question">
          <p>{challenge.text}</p>
        </div>

        {/* Answer Options */}
        <div className="quiz-options">
          {challenge.options.map((option, index) => {
            let optionClass = 'quiz-option';
            if (isAnswered && answerResult) {
              if (index === challenge.correctIndex) {
                optionClass += ' quiz-option--correct';
              } else if (index === selectedIndex && !answerResult.isCorrect) {
                optionClass += ' quiz-option--wrong';
              } else {
                optionClass += ' quiz-option--disabled';
              }
            } else if (index === selectedIndex) {
              optionClass += ' quiz-option--selected';
            }

            return (
              <button
                key={index}
                className={optionClass}
                onClick={() => handleSelect(index)}
                disabled={isAnswered}
              >
                <span className="quiz-option__letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="quiz-option__text">{option}</span>
              </button>
            );
          })}
        </div>

        {/* Result Feedback */}
        {isAnswered && answerResult && (
          <div className={`quiz-result ${answerResult.isCorrect ? 'quiz-result--correct' : 'quiz-result--wrong'}`}>
            {/* Correct/Wrong Banner */}
            <div className="quiz-result__banner">
              {answerResult.isCorrect ? (
                <><CheckCircle2 size={18} /> Correct!</>
              ) : (
                <><XCircle size={18} /> Incorrect</>
              )}
            </div>

            {/* Game consequence (reward or penalty) */}
            {answerResult.isCorrect && answerResult.reward.description && (
              <p className="quiz-result__reward">{answerResult.reward.description}</p>
            )}
            {!answerResult.isCorrect && answerResult.penalty && (
              <p className="quiz-result__penalty">{answerResult.penalty.description}</p>
            )}

            {/* Correct answer shown on wrong */}
            {!answerResult.isCorrect && (
              <p className="quiz-result__answer">
                Correct answer: <strong>{answerResult.correctAnswer}</strong>
              </p>
            )}

            {/* Streak info */}
            {answerResult.streakCount > 1 && (
              <p className="quiz-result__streak">
                <Flame size={14} /> {answerResult.streakCount}-streak!
              </p>
            )}
            {answerResult.streakBroken && (
              <p className="quiz-result__streak-broken">
                Streak ended. Keep going!
              </p>
            )}

            {/* Milestones */}
            {answerResult.milestones.map((m, i) => (
              <p key={i} className="quiz-result__milestone">
                <Trophy size={14} /> {m.badge} — +${m.cashBonus}!
              </p>
            ))}

            {/* Continue button */}
            <button className="quiz-continue-btn" onClick={onContinue}>
              Continue
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
