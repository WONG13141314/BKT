import { generateQuestion, generateQuestionBank, generateSmartBuyQuestion } from '../question.generator';

function withSeededRandom<T>(seed: number, action: () => T): T {
  const originalRandom = Math.random;
  let state = seed;
  Math.random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };

  try {
    return action();
  } finally {
    Math.random = originalRandom;
  }
}

describe('Question Generator — Redesigned Math Monopoly', () => {
  describe('generateQuestion', () => {
    const skills = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const difficulties: (1 | 2 | 3)[] = [1, 2, 3];

    for (const skill of skills) {
      for (const diff of difficulties) {
        it(`should generate a valid ${skill} question at difficulty ${diff}`, () => {
          const q = generateQuestion(skill, diff);

          expect(q.text).toBeTruthy();
          expect(q.options).toHaveLength(4);
          expect(q.correctIndex).toBeGreaterThanOrEqual(0);
          expect(q.correctIndex).toBeLessThan(4);
          expect(q.difficulty).toBe(diff);
          expect(q.skillName).toBe(skill);
        });
      }
    }

    it('should throw for unknown skill', () => {
      expect(() => generateQuestion('UnknownSkill', 1)).toThrow();
    });

    it('should generate column questions for Addition', () => {
      const q = generateQuestion('Addition', 1);
      expect(q.questionData.type).toBe('column');
      if (q.questionData.type === 'column') {
        expect(q.questionData.operation).toBe('+');
      }
    });

    it('should generate column questions for Subtraction', () => {
      const q = generateQuestion('Subtraction', 2);
      expect(q.questionData.type).toBe('column');
      if (q.questionData.type === 'column') {
        expect(q.questionData.operation).toBe('-');
      }
    });

    it('should generate column questions for Multiplication', () => {
      const q = generateQuestion('Multiplication', 1);
      expect(q.questionData.type).toBe('column');
      if (q.questionData.type === 'column') {
        expect(q.questionData.operation).toBe('×');
      }
    });

    it('should generate long division questions for Division', () => {
      const q = generateQuestion('Division', 1);
      expect(q.questionData.type).toBe('long_division');
      if (q.questionData.type === 'long_division') {
        expect(q.questionData.divisor).toBeGreaterThan(0);
        expect(q.questionData.steps.length).toBeGreaterThan(0);
      }
    });

    it.each([1, 2] as const)('generates exact division at difficulty %s', (difficulty) => {
      withSeededRandom(0xD1A1 + difficulty, () => {
        for (let i = 0; i < 500; i += 1) {
          const question = generateQuestion('Division', difficulty).questionData;

          expect(question.type).toBe('long_division');
          if (question.type === 'long_division') expect(question.remainder).toBe(0);
        }
      });
    });

    it('reserves non-zero remainders and remainder prompts for hard division', () => {
      const targets = new Set<string>();

      withSeededRandom(0xBEEF, () => {
        for (let i = 0; i < 500; i += 1) {
          const question = generateQuestion('Division', 3).questionData;

          expect(question.type).toBe('long_division');
          if (question.type === 'long_division') {
            expect(question.remainder).toBeGreaterThan(0);
            targets.add(question.missingTarget);
          }
        }
      });

      expect(targets).toContain('remainder');
    });

    it.each([
      ['Addition', 240],
      ['Subtraction', 192],
      ['Multiplication', 48],
      ['Division', 48],
    ] as const)('uses the property price for %s Smart Buy calculations', (skill, expectedAnswer) => {
      const question = generateSmartBuyQuestion(240, 2, skill);

      expect(question.questionData).toEqual({ type: 'mcq', text: question.text });
      expect(question.text).toContain('240');
      expect(question.options[question.correctIndex]).toBe(String(expectedAnswer));
    });
  });

  describe('generateQuestionBank', () => {
    it('should generate the expected number of questions', () => {
      const bank = generateQuestionBank(5); // 4 skills × 3 difficulties × 5 = 60
      expect(bank).toHaveLength(60);
    });

    it('should cover all 4 core skills', () => {
      const bank = generateQuestionBank(2);
      const skills = new Set(bank.map((q) => q.skillName));
      expect(skills.size).toBe(4);
      expect(skills).toEqual(new Set(['Addition', 'Subtraction', 'Multiplication', 'Division']));
    });

    it('should cover all difficulty levels', () => {
      const bank = generateQuestionBank(2);
      const diffs = new Set(bank.map((q) => q.difficulty));
      expect(diffs).toEqual(new Set([1, 2, 3]));
    });

    it('should generate mathematically valid questions where options[correctIndex] matches the missing target', () => {
      // Stress test 500 generated questions across all skills & difficulties
      for (let i = 0; i < 500; i++) {
        const skills = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
        const diff = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
        const skill = skills[Math.floor(Math.random() * skills.length)];
        const q = generateQuestion(skill, diff);

        const chosenOption = Number(q.options[q.correctIndex]);

        if (q.questionData.type === 'column') {
          const cd = q.questionData;
          if (cd.missingPosition === 'answer') {
            expect(chosenOption).toBe(cd.answer);
          } else if (cd.missingPosition === 'top_operand') {
            expect(chosenOption).toBe(cd.topNumber);
          } else if (cd.missingPosition === 'bottom_operand') {
            expect(chosenOption).toBe(cd.bottomNumber);
          } else if (cd.missingPosition === 'internal_digit') {
            const rowNumber = cd.missingDigitRow === 'bottom' ? cd.bottomNumber : cd.topNumber;
            let expectedDigit: number;
            if (cd.missingDigitPlace === 'hundreds') {
              expectedDigit = Math.floor(rowNumber / 100) % 10;
            } else if (cd.missingDigitPlace === 'tens') {
              expectedDigit = Math.floor(rowNumber / 10) % 10;
            } else {
              expectedDigit = rowNumber % 10;
            }
            expect(chosenOption).toBe(expectedDigit);
          }
        } else if (q.questionData.type === 'long_division') {
          const ld = q.questionData;
          const step = ld.steps[ld.missingStepIndex];

          // The algorithm itself must be internally consistent
          expect(ld.divisor * ld.quotient + ld.remainder).toBe(ld.dividend);

          if (ld.missingTarget === 'quotient_digit') {
            expect(chosenOption).toBe(step.quotientDigit);
          } else if (ld.missingTarget === 'product') {
            expect(chosenOption).toBe(step.product);
          } else if (ld.missingTarget === 'subtraction_result') {
            expect(chosenOption).toBe(step.subtractionResult);
          } else if (ld.missingTarget === 'remainder') {
            expect(chosenOption).toBe(ld.remainder);
          }
        }
      }
    });
  });

  describe('Smart Buy question bank', () => {
    it('keeps 24,000 price-context options valid, unique, and balanced', () => {
      const correctIndexCounts = [0, 0, 0, 0];
      const prices = [40, 80, 120, 160, 200, 240];
      const skills = ['Addition', 'Subtraction', 'Multiplication', 'Division'] as const;

      withSeededRandom(0x5B00, () => {
        for (const skill of skills) {
          for (const difficulty of [1, 2, 3] as const) {
            for (let i = 0; i < 2_000; i += 1) {
              const price = prices[i % prices.length];
              const question = generateSmartBuyQuestion(price, difficulty, skill);

              expect(question.questionData).toEqual({ type: 'mcq', text: question.text });
              expect(question.text).toContain(String(price));
              expect(question.options).toHaveLength(4);
              expect(new Set(question.options).size).toBe(4);
              expect(question.options[question.correctIndex]).toBeDefined();
              expect(question.options.every((option) => Number.isFinite(Number(option)) && Number(option) >= 0)).toBe(true);
              correctIndexCounts[question.correctIndex] += 1;
            }
          }
        }
      });

      for (const count of correctIndexCounts) expect(count).toBeGreaterThan(5_000);
    });
  });
});
