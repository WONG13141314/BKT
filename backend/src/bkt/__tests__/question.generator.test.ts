import { generateQuestion, generateQuestionBank } from '../question.generator';

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
  });
});
