import { useState, useEffect } from 'react';
import { Dices } from 'lucide-react';
import './DiceRoller.css';

interface DiceRollerProps {
  diceValues: [number, number];
  isMyTurn: boolean;
  turnPhase: string;
  onRollClick: () => void;
  disabled?: boolean;
}

// Dice face dot positions
const DICE_DOTS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 25, y: 25 }, { x: 75, y: 75 }],
  3: [{ x: 25, y: 25 }, { x: 50, y: 50 }, { x: 75, y: 75 }],
  4: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  5: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 50, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  6: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
};

function DiceFace({ value, isRolling }: { value: number; isRolling: boolean }) {
  const dots = DICE_DOTS[value] || DICE_DOTS[1];
  return (
    <div className={`dice-face ${isRolling ? 'dice-face--rolling' : ''}`}>
      <svg viewBox="0 0 100 100" className="dice-svg">
        {dots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r="10" className="dice-dot" />
        ))}
      </svg>
    </div>
  );
}

export function DiceRoller({
  diceValues,
  isMyTurn,
  turnPhase,
  onRollClick,
  disabled = false,
}: DiceRollerProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [displayValues, setDisplayValues] = useState<[number, number]>(diceValues);

  // Animate dice when values change
  useEffect(() => {
    if (diceValues[0] === displayValues[0] && diceValues[1] === displayValues[1]) return;

    setIsRolling(true);
    const interval = setInterval(() => {
      setDisplayValues([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 80);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayValues(diceValues);
      setIsRolling(false);
    }, 600);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [diceValues]);

  const total = diceValues[0] + diceValues[1];
  const canRoll = isMyTurn && turnPhase === 'ROLL_PHASE' && !disabled;

  // Turn phase labels
  const getStatusText = () => {
    if (canRoll) return 'Roll Dice';
    switch (turnPhase) {
      case 'MOVING': return 'Moving...';
      case 'DICE_CHALLENGE': return 'Dice Challenge!';
      case 'RESOLVE_TILE': return 'Resolving...';
      default: return 'Wait...';
    }
  };

  return (
    <div className="dice-roller">
      <div className="dice-pair">
        <DiceFace value={displayValues[0]} isRolling={isRolling} />
        <DiceFace value={displayValues[1]} isRolling={isRolling} />
      </div>

      {/* Total display — pure dice, no movement modifier */}
      <div className="dice-total">
        <span className="dice-total__value">{total}</span>
      </div>

      {/* Roll button */}
      <button
        className={`dice-roll-btn ${canRoll ? 'dice-roll-btn--active' : ''}`}
        onClick={onRollClick}
        disabled={!canRoll}
      >
        <Dices size={18} />
        {getStatusText()}
      </button>
    </div>
  );
}
