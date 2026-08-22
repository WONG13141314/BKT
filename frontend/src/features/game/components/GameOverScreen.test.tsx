import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameOverScreen } from './GameOverScreen';

describe('GameOverScreen', () => {
  it('shows final scores and the private four-skill report immediately', () => {
    render(<GameOverScreen scores={[{
      playerId: 'p1', playerName: 'Aina', color: '#ef3e4d', isBot: false,
      cash: 300, propertyValue: 200, levelUpValue: 0, netWorth: 500,
      totalCorrect: 4, totalQuestions: 6, rank: 1,
    }]} masteryReport={{
      playerId: 'p1', playerName: 'Aina', overallAccuracy: 2 / 3,
      bestSkill: 'Addition', weakestSkill: 'Division',
      skills: ['Addition', 'Subtraction', 'Multiplication', 'Division'].map((skillName, index) => ({
        skillName: skillName as 'Addition' | 'Subtraction' | 'Multiplication' | 'Division',
        mastery: 0.35 + index * 0.1, totalAttempts: index + 1, isMastered: false,
      })),
    }} />);
    expect(screen.getByRole('heading', { name: /game over/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /my learning report/i })).toBeVisible();
    expect(screen.getAllByText(/%/)).toHaveLength(5);
  });
});
