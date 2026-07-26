import { generateQuestion } from '../../../bkt/question.generator';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { redactQuestionData, toPublicChallenge } from '../challenge.public';
import { ChallengeContext, PublicLongDivisionQuestion } from '../game.types';
import { SKILL_NAMES } from '../game.constants';

const SKILLS = [...SKILL_NAMES];
const DIFFICULTIES: (1 | 2 | 3)[] = [1, 2, 3];

/** Every scalar that appears anywhere in a payload, as strings. */
function scalars(value: unknown, out: string[] = []): string[] {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((v) => scalars(v, out));
  } else if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => scalars(v, out));
  } else {
    out.push(String(value));
  }
  return out;
}

describe('Challenge redaction', () => {
  describe('nothing derived from the answer survives', () => {
    for (const skill of SKILLS) {
      for (const difficulty of DIFFICULTIES) {
        it(`${skill} d${difficulty} keeps the answer server-side`, () => {
          for (let i = 0; i < 200; i++) {
            const q = generateQuestion(skill, difficulty);
            const publicData = redactQuestionData(q.questionData);
            const serialised = JSON.stringify(publicData);

            // No answer-bearing property may survive as a key.
            expect(serialised).not.toMatch(
              /"(answer|answerDigits|correctIndex|topNumber|bottomNumber|quotient|remainder|dividend|product|subtractionResult|quotientDigit|missingTarget|missingPosition|missingStepIndex)":/
            );

            // Exactly one '?' cell — the thing the player supplies.
            const questionMarks = scalars(publicData).filter((s) => s === '?');
            expect(questionMarks).toHaveLength(1);
          }
        });
      }
    }
  });

  it('strips correctIndex and the debug text from the challenge envelope', () => {
    const challenge = selectChallenge({
      masteryStates: Object.fromEntries(SKILLS.map((s) => [s, 0.5])),
      context: 'CHALLENGE_CARD' as ChallengeContext,
      consecutiveFailures: {},
    });

    const publicChallenge = toPublicChallenge(challenge) as unknown as Record<string, unknown>;

    expect(publicChallenge.correctIndex).toBeUndefined();
    expect(publicChallenge.text).toBeUndefined();
    expect(publicChallenge.options).toHaveLength(4);
    expect(publicChallenge.expiresAt).toBeGreaterThan(Date.now());
  });

  describe('long division does not render its own answer', () => {
    it('never draws work at or beyond the target step', () => {
      for (let i = 0; i < 300; i++) {
        const difficulty = DIFFICULTIES[i % 3];
        const q = generateQuestion('Division', difficulty);
        if (q.questionData.type !== 'long_division') continue;

        const source = q.questionData;
        const publicData = redactQuestionData(source) as PublicLongDivisionQuestion;
        const answer = Number(q.options[q.correctIndex]);

        // The rendered work must stop at the target step.
        expect(publicData.steps.length).toBeLessThanOrEqual(source.missingStepIndex + 1);

        // The quotient must not spell out a digit the player has to supply.
        if (source.missingTarget === 'quotient_digit') {
          expect(publicData.quotientCells[source.missingStepIndex]).toBe('?');
          for (let s = source.missingStepIndex + 1; s < publicData.quotientCells.length; s++) {
            expect(publicData.quotientCells[s]).toBe('');
          }
        }

        // A single-digit answer must not be sitting in a visible cell of the
        // row it belongs to.
        const targetStepRow = publicData.steps[source.missingStepIndex];
        if (targetStepRow) {
          if (source.missingTarget === 'product') {
            expect(targetStepRow.productCells).toContain('?');
            expect(targetStepRow.resultCells).toBeNull();
          }
          if (source.missingTarget === 'subtraction_result') {
            expect(targetStepRow.resultCells).toContain('?');
          }
          if (source.missingTarget === 'remainder') {
            expect(targetStepRow.resultCells).toBeNull();
            expect(publicData.remainderCell).toBe('?');
            expect(answer).toBe(source.remainder);
          }
        }
      }
    });

    it('shows the dividend but never leaks it as the answer', () => {
      // `brought_down_digit` used to be a target; its answer was printed in the
      // dividend row directly above the blank. It must no longer be generated.
      for (let i = 0; i < 300; i++) {
        const q = generateQuestion('Division', DIFFICULTIES[i % 3]);
        if (q.questionData.type !== 'long_division') continue;
        expect(q.questionData.missingTarget).not.toBe('brought_down_digit');
      }
    });
  });

  describe('column questions', () => {
    it('hides the whole row when the target is a full value', () => {
      for (let i = 0; i < 300; i++) {
        const skill = SKILLS[i % 3]; // Addition / Subtraction / Multiplication
        const q = generateQuestion(skill, DIFFICULTIES[i % 3]);
        if (q.questionData.type !== 'column') continue;

        const source = q.questionData;
        const publicData = redactQuestionData(source);
        if (publicData.type !== 'column') continue;

        if (source.missingPosition === 'answer') {
          expect(publicData.hiddenRow).toBe('answer');
          expect(publicData.answerCells).toEqual(['?']);
        } else if (source.missingPosition === 'internal_digit') {
          // A digit target keeps the rest of the row visible.
          expect(publicData.hiddenRow).toBeNull();
          const row =
            source.missingDigitRow === 'bottom' ? publicData.bottomCells : publicData.topCells;
          expect(row).toContain('?');
        }
      }
    });

    it('only scaffolds regrouping when the target is the final answer', () => {
      for (let i = 0; i < 300; i++) {
        const q = generateQuestion(SKILLS[i % 3], DIFFICULTIES[i % 3]);
        if (q.questionData.type !== 'column') continue;

        const publicData = redactQuestionData(q.questionData);
        if (publicData.type !== 'column') continue;

        if (q.questionData.missingPosition !== 'answer') {
          expect(publicData.hasRegrouping).toBe(false);
        }
      }
    });
  });
});
