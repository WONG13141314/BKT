import { buildQuestionHint } from '../hints';
import { generateQuestion } from '../question.generator';
import { redactQuestionData, toPublicChallenge } from '../../features/game/challenge.public';
import { makePrivateChallenge } from '../../test/game.fixtures';
import { SKILL_NAMES } from '../../features/game/game.constants';
import type { HintHighlight, PublicQuestionData, QuestionData } from '../../features/game/game.types';

function highlightedCells(q: PublicQuestionData, highlight: HintHighlight): string[] {
  if (q.type === 'column') {
    const rows = { top: q.topCells, bottom: q.bottomCells, answer: q.answerCells };
    return rows[highlight.row as keyof typeof rows];
  }
  if (highlight.row === 'divisor') return [String(q.divisor)];
  if (highlight.row === 'dividend') return q.dividendCells;
  if (highlight.row === 'quotient') return q.quotientCells;
  if (highlight.row === 'remainder') return [q.remainderCell!];
  const step = q.steps[highlight.stepIndex!];
  return highlight.row === 'product' ? step.productCells : step.resultCells!;
}

describe('one visual question-specific hint', () => {
  it('offers no hint content until the server records a request', () => {
    const challenge = makePrivateChallenge();
    expect(toPublicChallenge(challenge)).not.toHaveProperty('hint');
    const hinted = toPublicChallenge({ ...challenge, hintRequestedAt: 1_500 });
    expect(hinted.hint?.content).toBeTruthy();
    expect(hinted.options).toEqual(challenge.options);
    expect(hinted.expiresAt).toBe(challenge.startedAt + challenge.timeLimit * 1_000);
    expect(hinted).not.toHaveProperty('hintRequestedAt');
    expect(hinted).not.toHaveProperty('correctIndex');
  });

  it('points at the actual missing digit and its matching column', () => {
    const source = { ...makePrivateChallenge().questionData,
      missingPosition: 'internal_digit', missingDigitPlace: 'ones', missingDigitRow: 'top',
    } as QuestionData;
    const hint = buildQuestionHint(source, redactQuestionData(source));
    // 1 + 1 = 2 with the top ones digit hidden: the hint names the column sum.
    expect(hint.content).toBe('Ones: ? + 1 must end in 2. Which digit makes that true?');
    expect(hint.highlights).toContainEqual({ row: 'top', column: 0 });
    expect(hint.highlights).toContainEqual({ row: 'answer', column: 0 });
  });

  it('uses the correct inverse operation for each hidden subtraction operand', () => {
    const base = makePrivateChallenge().questionData;
    if (base.type !== 'column') throw new Error('Expected column fixture');
    const top = { ...base, operation: '-' as const, missingPosition: 'top_operand' as const };
    const bottom = { ...base, operation: '-' as const, missingPosition: 'bottom_operand' as const };
    expect(buildQuestionHint(top, redactQuestionData(top)).content).toMatch(/^Add/);
    expect(buildQuestionHint(bottom, redactQuestionData(bottom)).content).toMatch(/^Subtract/);
  });

  it('maps division highlights to public step indices after skipped leading work', () => {
    const source: QuestionData = {
      type: 'long_division', divisor: 4, dividend: 12, quotient: 3, remainder: 0,
      steps: [
        { quotientDigit: 0, product: 0, subtractionResult: 1, broughtDownDigit: 2 },
        { quotientDigit: 3, product: 12, subtractionResult: 0, broughtDownDigit: null },
      ],
      missingTarget: 'product', missingStepIndex: 1,
    };
    const publicQuestion = redactQuestionData(source);
    const hint = buildQuestionHint(source, publicQuestion);
    expect(hint.highlights).toContainEqual({ row: 'product', stepIndex: 0 });
    expect(hint.highlights).toContainEqual({ row: 'quotient', column: 1 });
    expect(hint.content).not.toContain('12');
  });

  it('generates valid highlights without consulting hidden numeric fields across the bank', () => {
    const targets = new Set<string>();
    for (const skill of SKILL_NAMES) {
      for (const tier of [1, 2, 3] as const) {
        for (let i = 0; i < 50; i++) {
          const source = generateQuestion(skill, tier).questionData;
          const visible = redactQuestionData(source);
          const hint = buildQuestionHint(source, visible);
          targets.add(source.type === 'column' ? source.missingPosition : source.missingTarget);
          expect(hint.content).toBeTruthy();
          expect(hint.highlights.length).toBeGreaterThan(0);
          for (const highlight of hint.highlights) {
            const cells = highlightedCells(visible, highlight);
            expect(cells).toBeDefined();
            if (highlight.column !== undefined) {
              expect(highlight.column).toBeGreaterThanOrEqual(0);
              expect(highlight.column).toBeLessThan(cells.length);
            }
          }
          const changed = source.type === 'column'
            ? { ...source, topNumber: 987654, bottomNumber: 876543, answer: 123456, answerDigits: { tens: 9, ones: 9 } }
            : { ...source, divisor: 999, dividend: 987654, quotient: 123456, remainder: 654321,
              steps: source.steps.map((step) => ({ ...step, quotientDigit: 9, product: 888888, subtractionResult: 777777 })) };
          expect(buildQuestionHint(changed, visible)).toEqual(hint);
        }
      }
    }
    expect(targets).toEqual(new Set(['answer', 'top_operand', 'bottom_operand', 'internal_digit',
      'quotient_digit', 'product', 'subtraction_result', 'remainder']));
  });
  it('names the numbers on screen and the next step, never a result', () => {
    const column = (operation: '+' | '-' | '×', top: number, bottom: number, answer: number): Extract<QuestionData, { type: 'column' }> => ({
      type: 'column', operation, topNumber: top, bottomNumber: bottom, answer, hasRegrouping: true,
      placeValues: { tens: { top: Math.floor(top / 10), bottom: Math.floor(bottom / 10) }, ones: { top: top % 10, bottom: bottom % 10 } },
      answerDigits: { tens: Math.floor(answer / 10) % 10, ones: answer % 10 }, missingPosition: 'answer',
    });
    const hintFor = (q: QuestionData) => buildQuestionHint(q, redactQuestionData(q)).content;
    expect(hintFor(column('+', 36, 27, 63))).toBe(
      'Ones: 6 + 7. Write the ones digit; it is 10 or more, so carry 1. Then tens: 3 + 2 + 1 carried.');
    expect(hintFor(column('-', 54, 27, 27))).toBe(
      'Ones: 4 is smaller than 7, so borrow a ten: 14 − 7. Then tens: 5 − 1 − 2.');
    expect(hintFor({ ...column('+', 58, 27, 85), missingPosition: 'top_operand' })).toBe(
      'Subtract: 85 − 27 gives the missing number. Check by adding it back.');
    const division: QuestionData = {
      type: 'long_division', divisor: 7, dividend: 45, quotient: 6, remainder: 3,
      steps: [
        { quotientDigit: 0, product: 0, subtractionResult: 4, broughtDownDigit: 5 },
        { quotientDigit: 6, product: 42, subtractionResult: 3, broughtDownDigit: null },
      ],
      missingTarget: 'quotient_digit', missingStepIndex: 1,
    };
    expect(hintFor(division)).toBe('How many 7s fit into 45 without going over? Count in 7s: 7, 14, 21, …');
  });

  it('never states a hidden whole value across the question bank', () => {
    for (const skill of SKILL_NAMES) {
      for (const tier of [1, 2, 3] as const) {
        for (let i = 0; i < 100; i++) {
          const question = generateQuestion(skill, tier);
          const visible = redactQuestionData(question.questionData);
          const content = buildQuestionHint(question.questionData, visible).content;
          expect(content).not.toMatch(/null|NaN|undefined/);
          const target = Number(question.options[question.correctIndex]);
          const shown = visible.type === 'column'
            ? [visible.topCells, visible.bottomCells, visible.answerCells].map((row) => Number(row.filter((c) => /[0-9]/.test(c)).join('')))
            : [];
          const numbers = (content.match(/[0-9]+/g) ?? []).map(Number);
          if (target >= 10 && !shown.includes(target)) expect(numbers).not.toContain(target);
        }
      }
    }
  });
});
