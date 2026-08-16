import type { MathChallenge } from '../features/game/game.types';

/** A short, private worked line for the learner who answered the question. */
export function buildWorkedFeedback(challenge: MathChallenge): string {
  const { questionData, skillName } = challenge;

  if (questionData.type === 'column') {
    return `${skillName}: ${questionData.topNumber} ${questionData.operation} ${questionData.bottomNumber} = ${questionData.answer}.`;
  }

  if (questionData.type === 'long_division') {
    const remainder = questionData.remainder > 0 ? ` remainder ${questionData.remainder}` : '';
    return `${skillName}: ${questionData.dividend} ÷ ${questionData.divisor} = ${questionData.quotient}${remainder}.`;
  }

  if (challenge.context === 'SMART_BUY') {
    const equation = questionData.text.match(/(RM\d+)\s*([+−×÷])\s*((?:RM)?\d+(?:\.\d+)?)(?:\s*=)?\s*\?/u);
    if (equation) {
      const [, left, operator, right] = equation;
      const answer = challenge.options[challenge.correctIndex] ?? '';
      return `${skillName}: ${left} ${operator} ${right} = RM${answer}.`;
    }
  }

  return `${skillName}: the correct answer is ${challenge.options[challenge.correctIndex] ?? ''}.`;
}
