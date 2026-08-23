import type { MathChallenge } from '../features/game/game.types';

/** A short, private worked line for the learner who answered the question. */
export function buildWorkedFeedback(challenge: MathChallenge): string {
  const { questionData, skillName } = challenge;

  if (questionData.type === 'column') {
    return `${skillName}: ${questionData.topNumber} ${questionData.operation} ${questionData.bottomNumber} = ${questionData.answer}.`;
  }

  const remainder = questionData.remainder > 0 ? ` remainder ${questionData.remainder}` : '';
  return `${skillName}: ${questionData.dividend} ÷ ${questionData.divisor} = ${questionData.quotient}${remainder}.`;
}
