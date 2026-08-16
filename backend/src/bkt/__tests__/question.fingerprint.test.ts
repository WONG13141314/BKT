import type { GeneratedQuestion } from '../question.generator';
import { generateDistinctQuestion, questionFingerprint } from '../question.fingerprint';

function generatedColumn(
  operation: '+' | '-' | '×',
  topNumber: number,
  bottomNumber: number
): GeneratedQuestion {
  return {
    questionData: {
      type: 'column',
      operation,
      topNumber,
      bottomNumber,
      placeValues: {
        tens: { top: Math.floor(topNumber / 10) % 10, bottom: Math.floor(bottomNumber / 10) % 10 },
        ones: { top: topNumber % 10, bottom: bottomNumber % 10 },
      },
      answer: operation === '+' ? topNumber + bottomNumber : operation === '-' ? topNumber - bottomNumber : topNumber * bottomNumber,
      hasRegrouping: false,
      answerDigits: { tens: 0, ones: 0 },
      missingPosition: 'answer',
    },
    text: '',
    options: [],
    correctIndex: 0,
    difficulty: 1,
    skillName: 'Addition',
  };
}

function generatedMcq(text: string): GeneratedQuestion {
  return {
    questionData: { type: 'mcq', text },
    text,
    options: [],
    correctIndex: 0,
    difficulty: 1,
    skillName: 'Addition',
  };
}

describe('question fingerprints', () => {
  it('treats commutative addition and multiplication variants as the same question', () => {
    expect(questionFingerprint(generatedColumn('+', 7, 5))).toBe(questionFingerprint(generatedColumn('+', 5, 7)));
    expect(questionFingerprint(generatedColumn('×', 7, 5))).toBe(questionFingerprint(generatedColumn('×', 5, 7)));
  });

  it('keeps subtraction operand order meaningful', () => {
    expect(questionFingerprint(generatedColumn('-', 7, 5))).not.toBe(questionFingerprint(generatedColumn('-', 5, 7)));
  });

  it('normalizes incidental whitespace in equivalent MCQ prompts', () => {
    expect(questionFingerprint(generatedMcq('  What   is  7 + 5? '))).toBe(questionFingerprint(generatedMcq('What is 7 + 5?')));
  });

  it('retries a recent question but returns the final generated question after the bound', () => {
    const repeated = generatedColumn('+', 7, 5);
    const generate = jest.fn(() => repeated);

    const result = generateDistinctQuestion(generate, [questionFingerprint(generatedColumn('+', 5, 7))], 4);

    expect(generate).toHaveBeenCalledTimes(4);
    expect(result).toEqual(expect.objectContaining({
      fingerprint: questionFingerprint(repeated),
      questionData: repeated.questionData,
    }));
  });
});
