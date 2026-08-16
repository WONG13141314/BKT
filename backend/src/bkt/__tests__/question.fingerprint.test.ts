import type { GeneratedQuestion } from '../question.generator';
import { generateDistinctQuestion, questionFingerprint } from '../question.fingerprint';
import type { ColumnQuestion } from '../../features/game/game.types';

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

function generatedDivision(missingTarget: 'quotient_digit' | 'product', missingStepIndex: number): GeneratedQuestion {
  return {
    questionData: {
      type: 'long_division',
      divisor: 4,
      dividend: 84,
      quotient: 21,
      remainder: 0,
      steps: [
        { quotientDigit: 2, product: 8, subtractionResult: 0, broughtDownDigit: 4 },
        { quotientDigit: 1, product: 4, subtractionResult: 0, broughtDownDigit: null },
      ],
      missingTarget,
      missingStepIndex,
    },
    text: '',
    options: [],
    correctIndex: 0,
    difficulty: 1,
    skillName: 'Division',
  };
}

function generatedInternalColumn(
  missingDigitPlace: NonNullable<ColumnQuestion['missingDigitPlace']>,
  missingDigitRow: NonNullable<ColumnQuestion['missingDigitRow']>
): GeneratedQuestion {
  const question = generatedColumn('+', 27, 15);
  const data = question.questionData;
  if (data.type !== 'column') throw new Error('Expected a column question fixture');

  return {
    ...question,
    questionData: {
      ...data,
      missingPosition: 'internal_digit',
      missingDigitPlace,
      missingDigitRow,
    },
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

  it('distinguishes the target and step of long-division work', () => {
    const quotientAtFirstStep = questionFingerprint(generatedDivision('quotient_digit', 0));

    expect(questionFingerprint(generatedDivision('product', 0))).not.toBe(quotientAtFirstStep);
    expect(questionFingerprint(generatedDivision('quotient_digit', 1))).not.toBe(quotientAtFirstStep);
  });

  it('distinguishes the place and row of an internal column digit', () => {
    const topOnes = generatedInternalColumn('ones', 'top');
    const bottomOnes = generatedInternalColumn('ones', 'bottom');
    const topTens = generatedInternalColumn('tens', 'top');

    expect(questionFingerprint(bottomOnes)).not.toBe(questionFingerprint(topOnes));
    expect(questionFingerprint(topTens)).not.toBe(questionFingerprint(topOnes));
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

  it('stops early when its second generated question is fresh', () => {
    const repeated = generatedColumn('+', 7, 5);
    const fresh = generatedColumn('+', 8, 5);
    const generate = jest.fn()
      .mockReturnValueOnce(repeated)
      .mockReturnValueOnce(fresh);

    const result = generateDistinctQuestion(generate, [questionFingerprint(generatedColumn('+', 5, 7))], 6);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.fingerprint).toBe(questionFingerprint(fresh));
  });

  it.each([
    ['Infinity', Infinity, 6],
    ['NaN', NaN, 6],
    ['negative', -3, 6],
    ['zero', 0, 6],
    ['fractional', 2.8, 2],
    ['oversized', 100, 6],
  ])('bounds %s attempt input and still returns a generated question', (_label, maxAttempts, expectedCalls) => {
    const repeated = generatedColumn('+', 7, 5);
    const generate = jest.fn(() => repeated);

    const result = generateDistinctQuestion(
      generate,
      [questionFingerprint(generatedColumn('+', 5, 7))],
      maxAttempts
    );

    expect(generate).toHaveBeenCalledTimes(expectedCalls);
    expect(result.fingerprint).toBe(questionFingerprint(repeated));
  });
});
