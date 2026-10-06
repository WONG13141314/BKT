import type {
  HintHighlight,
  PublicColumnQuestion,
  PublicLongDivisionQuestion,
  PublicQuestionData,
  QuestionData,
  QuestionHint,
} from '../features/game/game.types';

/**
 * One visual strategy cue. Numeric cells always come from the redacted question;
 * hidden values and later division work never become hint content.
 */
export function buildQuestionHint(source: QuestionData, visible: PublicQuestionData): QuestionHint {
  if (source.type === 'column' && visible.type === 'column') return columnHint(visible);
  if (source.type === 'long_division' && visible.type === 'long_division') {
    return divisionHint(source.missingTarget, source.missingStepIndex, visible);
  }
  throw new Error('Hint question and its public layout must have the same type.');
}

function columnHint(q: PublicColumnQuestion): QuestionHint {
  const wholeRow = q.hiddenRow;
  if (wholeRow === 'top' || wholeRow === 'bottom') {
    let content: string;
    if (q.operation === '+') content = 'Subtract the known addend from the shown sum to find the missing number.';
    else if (q.operation === '×') content = 'Divide the shown product by the known factor. Check by multiplying.';
    else content = wholeRow === 'top'
      ? 'Add the shown result to the amount being subtracted to find the starting number.'
      : 'Subtract the shown result from the starting number to find the missing amount.';
    return { content, highlights: [{ row: 'top' }, { row: 'bottom' }, { row: 'answer' }] };
  }

  if (wholeRow === 'answer') {
    const ones = q.columns.length - 1;
    const content = q.operation === '+'
      ? 'Start with the ones column. Add these digits; carry if their total reaches ten.'
      : q.operation === '-'
        ? 'Start with the ones column. If the top digit is smaller, borrow from the next column.'
        : 'Multiply the bottom factor by the ones digit first. Carry into the next column if needed.';
    return { content, highlights: [
      { row: 'top', column: ones },
      { row: 'bottom', ...(q.operation === '×' ? {} : { column: ones }) },
      { row: 'answer', column: 0 },
    ] };
  }

  const topMissing = q.topCells.indexOf('?');
  const column = topMissing >= 0 ? topMissing : q.bottomCells.indexOf('?');
  const content = q.operation === '+'
    ? 'Find the digit that makes this column match the shown sum. Include any carry from the right.'
    : q.operation === '-'
      ? 'Find the digit that makes this column match the shown result. Check for borrowing from the left.'
      : 'Use the shown product and known factor to work backwards to the highlighted missing digit.';
  const highlights: HintHighlight[] = [
    { row: 'top', column }, { row: 'bottom', column },
    q.operation === '×' ? { row: 'answer' } : { row: 'answer', column },
  ];
  return { content, highlights };
}

function divisionHint(
  target: Extract<QuestionData, { type: 'long_division' }>['missingTarget'],
  quotientColumn: number,
  q: PublicLongDivisionQuestion
): QuestionHint {
  const divisor: HintHighlight = { row: 'divisor' };
  switch (target) {
    case 'quotient_digit': {
      const column = q.quotientCells.indexOf('?');
      const highlights: HintHighlight[] = [divisor, { row: 'quotient', column }];
      if (q.steps.length > 0 && q.steps[q.steps.length - 1].resultCells) {
        highlights.push({ row: 'result', stepIndex: q.steps.length - 1 });
      } else q.dividendCells.slice(0, column + 1).forEach((_, index) => highlights.push({ row: 'dividend', column: index }));
      return {
        content: 'How many groups of the divisor fit into the current number without going over?',
        highlights,
      };
    }
    case 'product': {
      const stepIndex = q.steps.findIndex((step) => step.productCells.includes('?'));
      return {
        content: 'Multiply the quotient digit above this column by the divisor to find what to subtract.',
        highlights: [divisor, { row: 'quotient', column: quotientColumn }, { row: 'product', stepIndex }],
      };
    }
    case 'subtraction_result': {
      const stepIndex = q.steps.findIndex((step) => step.resultCells?.includes('?'));
      const highlights: HintHighlight[] = [
        { row: 'product', stepIndex }, { row: 'result', stepIndex },
      ];
      if (stepIndex > 0) highlights.push({ row: 'result', stepIndex: stepIndex - 1 });
      else q.dividendCells.slice(0, quotientColumn + 1).forEach((_, index) => highlights.push({ row: 'dividend', column: index }));
      return { content: 'Subtract the highlighted product from the current number above it.', highlights };
    }
    case 'remainder': {
      const highlights: HintHighlight[] = [divisor, { row: 'product', stepIndex: q.steps.length - 1 }, { row: 'remainder' }];
      if (q.steps.length > 1) highlights.push({ row: 'result', stepIndex: q.steps.length - 2 });
      else highlights.push({ row: 'dividend' });
      return {
        content: 'Do the final subtraction. The remainder must be smaller than the divisor.',
        highlights,
      };
    }
  }
}
