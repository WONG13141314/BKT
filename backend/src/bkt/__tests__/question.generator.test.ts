import { generateQuestion, generateQuestionBank, generateBuyPropertyQuestion, generateRentQuestion, generateTaxQuestion, generateBuildHouseQuestion } from '../question.generator';

describe('Question Generator', () => {
  describe('generateQuestion', () => {
    const skills = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Fractions', 'Decimals'];
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
  });

  describe('generateQuestionBank', () => {
    it('should generate the expected number of questions', () => {
      const bank = generateQuestionBank(5); // 6 skills × 3 difficulties × 5 = 90
      expect(bank).toHaveLength(90);
    });

    it('should cover all skills', () => {
      const bank = generateQuestionBank(2);
      const skills = new Set(bank.map((q) => q.skillName));
      expect(skills.size).toBe(6);
    });

    it('should cover all difficulty levels', () => {
      const bank = generateQuestionBank(2);
      const diffs = new Set(bank.map((q) => q.difficulty));
      expect(diffs).toEqual(new Set([1, 2, 3]));
    });
  });

  describe('Contextual generators', () => {
    it('should generate buy property questions with real game values', () => {
      const q = generateBuyPropertyQuestion(520, 180, 1);
      expect(q.text).toContain('$520');
      expect(q.text).toContain('$180');
      expect(q.skillName).toBe('Subtraction');
      expect(q.options).toHaveLength(4);
    });

    it('should generate rent questions', () => {
      const q = generateRentQuestion(40, 2, 1);
      expect(q.skillName).toBe('Multiplication');
      expect(q.options).toHaveLength(4);
    });

    it('should generate tax questions', () => {
      const q = generateTaxQuestion(1200, 'INCOME', 1);
      expect(q.text).toContain('1200');
      expect(q.options).toHaveLength(4);
    });

    it('should generate build house questions', () => {
      const q = generateBuildHouseQuestion(50, 3, 1);
      expect(q.text).toContain('$50');
      expect(q.text).toContain('3');
      expect(q.skillName).toBe('Multiplication');
    });
  });
});
