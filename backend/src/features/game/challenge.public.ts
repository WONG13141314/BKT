// ============================================
// Challenge redaction — the only place a challenge becomes client-safe
//
// The server keeps the full `MathChallenge` (answer included) in game state and
// grades against it. Clients receive the `PublicMathChallenge` produced here,
// which contains no answer in any form. Two rules drive the whole file:
//
//   1. The target value is replaced by '?'.
//   2. Nothing downstream of the target is rendered — in long division the
//      later steps would let you solve backwards for the hidden value.
// ============================================

import {
  ColumnPlace,
  ColumnQuestion,
  DigitCell,
  LongDivisionQuestion,
  MathChallenge,
  PublicColumnQuestion,
  PublicDivisionStep,
  PublicLongDivisionQuestion,
  PublicMathChallenge,
  PublicQuestionData,
  QuestionData,
} from './game.types';

const HIDDEN: DigitCell = '?';
const BLANK: DigitCell = '';

const PLACE_UNIT: Record<ColumnPlace, number> = {
  hundreds: 100,
  tens: 10,
  ones: 1,
};

/** Digits of `value` laid out over `columns`, with leading positions left blank. */
function layoutDigits(value: number, columns: ColumnPlace[]): DigitCell[] {
  const magnitude = Math.abs(value);
  return columns.map((place) => {
    const unit = PLACE_UNIT[place];
    if (unit > 1 && magnitude < unit) return BLANK;
    return String(Math.floor(magnitude / unit) % 10);
  });
}

/** Right-align `value`'s digits so its last digit sits in column `endCol`. */
function alignRight(value: number, endCol: number, width: number): DigitCell[] {
  const digits = String(Math.abs(value)).split('');
  const cells: DigitCell[] = new Array(width).fill(BLANK);
  for (let i = 0; i < digits.length; i++) {
    const col = endCol - (digits.length - 1 - i);
    if (col >= 0 && col < width) cells[col] = digits[i];
  }
  return cells;
}

/** A single '?' box at `endCol`, everything else blank. */
function hiddenAt(endCol: number, width: number): DigitCell[] {
  const cells: DigitCell[] = new Array(width).fill(BLANK);
  if (endCol >= 0 && endCol < width) cells[endCol] = HIDDEN;
  return cells;
}

// ---- Column questions (+, −, ×) ----

function redactColumn(q: ColumnQuestion): PublicColumnQuestion {
  const largest = Math.max(
    Math.abs(q.topNumber),
    Math.abs(q.bottomNumber),
    Math.abs(q.answer)
  );
  const columns: ColumnPlace[] =
    largest >= 100 ? ['hundreds', 'tens', 'ones']
    : largest >= 10 ? ['tens', 'ones']
    : ['ones'];

  let topCells = layoutDigits(q.topNumber, columns);
  let bottomCells = layoutDigits(q.bottomNumber, columns);
  let answerCells = layoutDigits(q.answer, columns);
  let hiddenRow: PublicColumnQuestion['hiddenRow'] = null;

  switch (q.missingPosition) {
    case 'answer':
      hiddenRow = 'answer';
      answerCells = [HIDDEN];
      break;
    case 'top_operand':
      hiddenRow = 'top';
      topCells = [HIDDEN];
      break;
    case 'bottom_operand':
      hiddenRow = 'bottom';
      bottomCells = [HIDDEN];
      break;
    case 'internal_digit': {
      const place = q.missingDigitPlace ?? 'ones';
      const col = columns.indexOf(place);
      if (col >= 0) {
        if (q.missingDigitRow === 'bottom') bottomCells[col] = HIDDEN;
        else topCells[col] = HIDDEN;
      }
      break;
    }
  }

  return {
    type: 'column',
    operation: q.operation,
    columns,
    topCells,
    bottomCells,
    answerCells,
    hiddenRow,
    // Knowing a carry exists narrows a missing *digit*, so only scaffold the
    // pure-computation case where the player is asked for the final answer.
    hasRegrouping: q.missingPosition === 'answer' && q.hasRegrouping,
  };
}

// ---- Long division ----

function redactLongDivision(q: LongDivisionQuestion): PublicLongDivisionQuestion {
  const dividendCells = String(q.dividend).split('');
  const width = dividendCells.length;
  const target = q.missingTarget;
  const targetStep = Math.min(Math.max(q.missingStepIndex, 0), q.steps.length - 1);

  // Quotient digits sit above their dividend column; leading zeros stay blank.
  const firstSignificant = q.steps.findIndex((s) => s.quotientDigit > 0);
  const quotientCells: DigitCell[] = q.steps.map((step, i) => {
    if (firstSignificant >= 0 && i < firstSignificant) return BLANK;
    return String(step.quotientDigit);
  });

  // The quotient digit for the target step is only known once that step is done.
  if (target === 'quotient_digit') {
    quotientCells[targetStep] = HIDDEN;
  }
  // Everything after the target step is future work.
  for (let i = targetStep + 1; i < quotientCells.length; i++) {
    quotientCells[i] = BLANK;
  }

  const steps: PublicDivisionStep[] = [];
  for (let i = 0; i <= targetStep; i++) {
    const step = q.steps[i];

    // Leading columns the divisor doesn't go into are skipped, as when writing
    // the algorithm by hand.
    if (quotientCells[i] === BLANK && i < targetStep) continue;

    // The target step's own product row is unknown for a quotient-digit target.
    if (i === targetStep && target === 'quotient_digit') break;

    const productDigits = String(step.product).length;
    const isProductTarget = i === targetStep && target === 'product';

    const productCells = isProductTarget
      ? hiddenAt(i, width)
      : alignRight(step.product, i, width);

    const lineFrom = Math.max(0, i - (isProductTarget ? 0 : productDigits - 1));

    let resultCells: DigitCell[] | null;
    if (i === targetStep && (target === 'product' || target === 'remainder')) {
      // Product unknown, or the final result *is* the remainder being asked for.
      resultCells = null;
    } else if (i === targetStep && target === 'subtraction_result') {
      resultCells = hiddenAt(i, width);
    } else {
      resultCells = alignRight(step.subtractionResult, i, width);
      if (step.broughtDownDigit !== null && i + 1 < width) {
        resultCells[i + 1] = String(step.broughtDownDigit);
      }
    }

    steps.push({
      productCells,
      showMinus: isProductTarget || step.product > 0,
      lineFrom,
      lineTo: i,
      resultCells,
    });
  }

  return {
    type: 'long_division',
    divisor: q.divisor,
    dividendCells,
    quotientCells,
    steps,
    remainderCell: target === 'remainder' ? HIDDEN : null,
  };
}

// ---- Entry points ----

export function redactQuestionData(data: QuestionData): PublicQuestionData {
  switch (data.type) {
    case 'column':
      return redactColumn(data);
    case 'long_division':
      return redactLongDivision(data);
    case 'mcq':
      return { type: 'mcq', text: data.text };
  }
}

export function toPublicChallenge(challenge: MathChallenge): PublicMathChallenge {
  return {
    id: challenge.id,
    skillName: challenge.skillName,
    difficulty: challenge.difficulty,
    questionData: redactQuestionData(challenge.questionData),
    options: challenge.options,
    context: challenge.context,
    timeLimit: challenge.timeLimit,
    expiresAt: challenge.startedAt + challenge.timeLimit * 1000,
    hintLevel: challenge.hintLevel,
    hintContent: challenge.hintContent,
  };
}
