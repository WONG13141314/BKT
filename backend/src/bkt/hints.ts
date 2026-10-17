import type {
  ColumnPlace,
  DigitCell,
  HintHighlight,
  PublicColumnQuestion,
  PublicLongDivisionQuestion,
  PublicQuestionData,
  QuestionData,
  QuestionHint,
} from '../features/game/game.types';

/**
 * One visual strategy cue that names the learner's own numbers.
 *
 * Every number in a hint is read from the redacted question, never from the
 * hidden values, so a hint cannot leak the answer. A hint states the exact
 * calculation to do next (for example "Ones: 6 + 7"), and never its result.
 */
export function buildQuestionHint(source: QuestionData, visible: PublicQuestionData): QuestionHint {
  if (source.type === 'column' && visible.type === 'column') return columnHint(visible);
  if (source.type === 'long_division' && visible.type === 'long_division') {
    return divisionHint(source.missingTarget, source.missingStepIndex, visible);
  }
  throw new Error('Hint question and its public layout must have the same type.');
}

// ---- Reading the visible layout ----

const PLACE_NAME: Record<ColumnPlace, string> = { hundreds: 'Hundreds', tens: 'Tens', ones: 'Ones' };
const NEXT_PLACE: Record<ColumnPlace, string> = { hundreds: 'thousands', tens: 'hundreds', ones: 'tens' };

function digitAt(cells: DigitCell[], column: number): number | null {
  const cell = cells[column];
  return cell !== undefined && /^\d$/.test(cell) ? Number(cell) : null;
}

/** The whole number shown in a row, or null if any part of it is hidden. */
function shownNumber(cells: DigitCell[]): number | null {
  if (cells.includes('?')) return null;
  const digits = cells.filter((cell) => /^\d$/.test(cell)).join('');
  return digits ? Number(digits) : null;
}

/** The value of the visible digits to the right of `column` (blank counts as 0). */
function valueRightOf(cells: DigitCell[], column: number): number {
  return cells.slice(column + 1).reduce((total, cell) => total * 10 + (digitAt([cell], 0) ?? 0), 0);
}

function sum(...terms: Array<number | string | null>): string {
  return terms.filter((term) => term !== null).join(' + ');
}

// ---- Column questions (+, −, ×) ----

function columnHint(q: PublicColumnQuestion): QuestionHint {
  const wholeRow = q.hiddenRow;
  if (wholeRow === 'top' || wholeRow === 'bottom') {
    return {
      content: wholeOperandHint(q, wholeRow),
      highlights: [{ row: 'top' }, { row: 'bottom' }, { row: 'answer' }],
    };
  }

  const ones = q.columns.length - 1;
  if (wholeRow === 'answer') {
    return {
      content: wholeAnswerHint(q),
      highlights: [
        { row: 'top', column: ones },
        { row: 'bottom', ...(q.operation === '×' ? {} : { column: ones }) },
        { row: 'answer', column: 0 },
      ],
    };
  }

  const missingRow: 'top' | 'bottom' | 'answer' = q.topCells.includes('?') ? 'top'
    : q.bottomCells.includes('?') ? 'bottom' : 'answer';
  const rowCells = { top: q.topCells, bottom: q.bottomCells, answer: q.answerCells }[missingRow];
  const column = rowCells.indexOf('?');
  const highlights: HintHighlight[] = [
    { row: 'top', column }, { row: 'bottom', column },
    q.operation === '×' ? { row: 'answer' } : { row: 'answer', column },
  ];
  return { content: missingDigitHint(q, missingRow, column), highlights };
}

function wholeOperandHint(q: PublicColumnQuestion, hidden: 'top' | 'bottom'): string {
  const top = shownNumber(q.topCells);
  const bottom = shownNumber(q.bottomCells);
  const answer = shownNumber(q.answerCells);
  const known = hidden === 'top' ? bottom : top;
  if (q.operation === '+') {
    return `Subtract: ${answer} − ${known} gives the missing number. Check by adding it back.`;
  }
  if (q.operation === '×') {
    return `Divide: ${answer} ÷ ${known} gives the missing number. Check: it × ${known} = ${answer}.`;
  }
  return hidden === 'top'
    ? `Add: ${answer} + ${bottom} gives the starting number. Check by taking ${bottom} away again.`
    : `Subtract: ${top} − ${answer} gives the amount taken away. Check: ${top} − it = ${answer}.`;
}

function wholeAnswerHint(q: PublicColumnQuestion): string {
  const ones = q.columns.length - 1;
  const tens = ones - 1;
  const top1 = digitAt(q.topCells, ones) ?? 0;
  const bottom1 = digitAt(q.bottomCells, ones) ?? 0;
  const top2 = tens >= 0 ? digitAt(q.topCells, tens) : null;
  const bottom2 = tens >= 0 ? digitAt(q.bottomCells, tens) : null;

  if (q.operation === '+') {
    const carry = top1 + bottom1 >= 10;
    const first = `Ones: ${top1} + ${bottom1}. Write the ones digit${carry ? '; it is 10 or more, so carry 1' : ''}.`;
    if (top2 === null && bottom2 === null) return first;
    if (bottom2 === null && !carry) return `${first} The tens digit ${top2} stays the same.`;
    return `${first} Then tens: ${sum(top2, bottom2, carry ? '1 carried' : null)}.`;
  }

  if (q.operation === '-') {
    const borrow = top1 < bottom1;
    const first = borrow
      ? `Ones: ${top1} is smaller than ${bottom1}, so borrow a ten: ${top1 + 10} − ${bottom1}.`
      : `Ones: ${top1} − ${bottom1}.`;
    if (top2 === null) return first;
    if (bottom2 === null && !borrow) return `${first} The tens digit ${top2} stays the same.`;
    const tensTop = borrow ? `${top2} − 1` : `${top2}`;
    const again = (top2 - (borrow ? 1 : 0)) < (bottom2 ?? 0) ? ' Too small? Borrow again from the hundreds.' : '';
    return `${first} Then tens: ${tensTop}${bottom2 !== null ? ` − ${bottom2}` : ''}.${again}`;
  }

  const top = shownNumber(q.topCells);
  const bottom = shownNumber(q.bottomCells);
  const bottomDigits = q.bottomCells.filter((cell) => /^\d$/.test(cell)).map(Number);
  if (bottomDigits.length === 1) {
    const multiplier = bottomDigits[0];
    const carry = Math.floor((top1 * multiplier) / 10);
    const first = `Ones: ${top1} × ${multiplier}. Write the ones digit${carry > 0 ? ` and carry ${carry}` : ''}.`;
    if (top2 === null) return first;
    return `${first} Then tens: ${top2} × ${multiplier}${carry > 0 ? ` + ${carry} carried` : ''}.`;
  }
  const [tensDigit, onesDigit] = bottomDigits.slice(-2);
  return `Split ${bottom} into ${tensDigit * 10} + ${onesDigit}. Work out ${top} × ${onesDigit} and ${top} × ${tensDigit * 10}, then add them.`;
}

function missingDigitHint(q: PublicColumnQuestion, row: 'top' | 'bottom' | 'answer', column: number): string {
  const place = q.columns[column];
  const name = PLACE_NAME[place];
  const width = q.columns.length - column - 1;
  const top = digitAt(q.topCells, column);
  const bottom = digitAt(q.bottomCells, column);
  const answer = digitAt(q.answerCells, column);

  if (q.operation === '+') {
    const carried = valueRightOf(q.topCells, column) + valueRightOf(q.bottomCells, column) >= 10 ** width;
    const carry = carried ? '1 carried' : null;
    if (row === 'answer') {
      if (top === null && bottom === null) return `This column only holds what carries over from the ${(q.columns[column + 1] ?? 'ones')} column.`;
      return `${name}: ${sum(top, bottom, carry)}. Write only the ones digit of that total.`;
    }
    const terms = row === 'top' ? sum('?', bottom, carry) : sum(top, '?', carry);
    return `${name}: ${terms} must end in ${answer ?? 0}. Which digit makes that true?`;
  }

  if (q.operation === '-') {
    if (row === 'answer') {
      const lent = valueRightOf(q.topCells, column) < valueRightOf(q.bottomCells, column);
      const shownTop = (top ?? 0) - (lent ? 1 : 0);
      const borrow = shownTop < (bottom ?? 0);
      const startValue = borrow ? (top ?? 0) + 10 : (top ?? 0);
      const expression = `${startValue}${lent ? ' − 1' : ''}${bottom !== null ? ` − ${bottom}` : ''}`;
      const notes = [
        lent ? 'the − 1 was lent to the column on the right' : null,
        borrow ? `borrow a ten from the ${NEXT_PLACE[place]}` : null,
      ].filter(Boolean).join('; ');
      return `${name}: ${expression}.${notes ? ` (${notes[0].toUpperCase()}${notes.slice(1)}.)` : ''}`;
    }
    // Check subtraction by adding: bottom + answer = top.
    const carried = valueRightOf(q.bottomCells, column) + valueRightOf(q.answerCells, column) >= 10 ** width;
    const carry = carried ? '1 carried' : null;
    return row === 'top'
      ? `Check by adding. ${name}: ${sum(bottom, answer, carry)}. Its ones digit is the missing top digit.`
      : `Check by adding. ${name}: ${sum('?', answer, carry)} must end in ${top ?? 0}. Which digit makes that true?`;
  }

  // Multiplication by a single shown digit.
  const multiplierDigits = q.bottomCells.filter((cell) => /^\d$/.test(cell));
  if (row !== 'bottom' && multiplierDigits.length === 1 && !q.bottomCells.includes('?')) {
    const multiplier = Number(multiplierDigits[0]);
    const carry = Math.floor((valueRightOf(q.topCells, column) * multiplier) / 10 ** width);
    const carried = carry > 0 ? ` + ${carry} carried` : '';
    if (row === 'answer') {
      if (top === null) return `This column only holds what carries over from the column on its right.`;
      return `${name}: ${top} × ${multiplier}${carried}. Write only the ones digit of that total.`;
    }
    return `${name}: ? × ${multiplier}${carried} must end in ${answer ?? 0}. Which digit makes that true?`;
  }
  if (row === 'bottom') {
    const topNumber = shownNumber(q.topCells);
    const answerNumber = shownNumber(q.answerCells);
    const lastTop = digitAt(q.topCells, q.columns.length - 1);
    const lastAnswer = digitAt(q.answerCells, q.columns.length - 1);
    if (topNumber !== null && answerNumber !== null && multiplierDigits.length === 0) {
      return `Which digit times ${topNumber} gives ${answerNumber}? Start with the ones: ${lastTop} × ? must end in ${lastAnswer}.`;
    }
  }
  return 'Use the shown product and the known factor to work backwards to the highlighted missing digit.';
}

// ---- Long division ----

function divisionHint(
  target: Extract<QuestionData, { type: 'long_division' }>['missingTarget'],
  quotientColumn: number,
  q: PublicLongDivisionQuestion
): QuestionHint {
  const divisor: HintHighlight = { row: 'divisor' };
  const d = q.divisor;
  /** The number being divided at a public step: the row above it, or the leading dividend digits. */
  const currentNumber = (stepIndex: number, column: number): number | null => stepIndex > 0
    ? shownNumber(q.steps[stepIndex - 1].resultCells ?? ['?'])
    : shownNumber(q.dividendCells.slice(0, column + 1));

  switch (target) {
    case 'quotient_digit': {
      const column = q.quotientCells.indexOf('?');
      const highlights: HintHighlight[] = [divisor, { row: 'quotient', column }];
      let current: number | null;
      if (q.steps.length > 0 && q.steps[q.steps.length - 1].resultCells) {
        highlights.push({ row: 'result', stepIndex: q.steps.length - 1 });
        current = shownNumber(q.steps[q.steps.length - 1].resultCells!);
      } else {
        q.dividendCells.slice(0, column + 1).forEach((_, index) => highlights.push({ row: 'dividend', column: index }));
        current = shownNumber(q.dividendCells.slice(0, column + 1));
      }
      return {
        content: current === null
          ? 'How many groups of the divisor fit into the current number without going over?'
          : `How many ${d}s fit into ${current} without going over? Count in ${d}s: ${d}, ${d * 2}, ${d * 3}, …`,
        highlights,
      };
    }
    case 'product': {
      const stepIndex = q.steps.findIndex((step) => step.productCells.includes('?'));
      const quotientDigit = digitAt(q.quotientCells, quotientColumn);
      return {
        content: quotientDigit === null
          ? 'Multiply the quotient digit above this column by the divisor to find what to subtract.'
          : `Multiply: ${quotientDigit} × ${d}. That is the number to subtract here.`,
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
      const current = currentNumber(stepIndex, quotientColumn);
      const product = shownNumber(q.steps[stepIndex].productCells);
      return {
        content: current === null || product === null
          ? 'Subtract the highlighted product from the current number above it.'
          : `Subtract: ${current} − ${product}.`,
        highlights,
      };
    }
    case 'remainder': {
      const last = q.steps.length - 1;
      const highlights: HintHighlight[] = [divisor, { row: 'product', stepIndex: last }, { row: 'remainder' }];
      if (q.steps.length > 1) highlights.push({ row: 'result', stepIndex: q.steps.length - 2 });
      else highlights.push({ row: 'dividend' });
      const current = q.steps.length > 1
        ? shownNumber(q.steps[last - 1].resultCells ?? ['?'])
        : shownNumber(q.dividendCells.slice(0, quotientColumn + 1));
      const product = shownNumber(q.steps[last].productCells);
      return {
        content: current === null || product === null
          ? 'Do the final subtraction. The remainder must be smaller than the divisor.'
          : `Last subtraction: ${current} − ${product}. The remainder must be smaller than ${d}.`,
        highlights,
      };
    }
  }
}
