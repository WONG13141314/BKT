// ============================================
// Question Generator — Universal Vertical Math & Dynamic (?) Placement
// 4 Core Skills: Addition, Subtraction, Multiplication, Division
// 100% Vertical Column Layout & Step-by-Step Long Division
// ============================================

import {
  ColumnQuestion,
  DivisionTarget,
  LongDivisionQuestion,
  LongDivisionStep,
  QuestionData,
} from '../features/game/game.types';

// ---- Public Interface ----

export interface GeneratedQuestion {
  questionData: QuestionData;   // Structured data for rendering
  text: string;                 // Fallback inline text
  options: string[];            // 4 MCQ answer choices
  correctIndex: number;
  difficulty: 1 | 2 | 3;
  skillName: string;
}

// ---- Random Utilities ----

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeOptions(
  correct: number,
  formatter: (n: number) => string = String,
  spread?: number
): { options: string[]; correctIndex: number } {
  const actualSpread = spread || Math.max(3, Math.ceil(Math.abs(correct) * 0.25));
  const distractors = new Set<number>();

  while (distractors.size < 3) {
    const offset = randInt(1, actualSpread) * (Math.random() > 0.5 ? 1 : -1);
    const distractor = correct + offset;
    if (distractor !== correct && distractor >= 0) {
      distractors.add(distractor);
    }
  }

  const allValues = shuffle([correct, ...distractors]);
  return {
    options: allValues.map(formatter),
    correctIndex: allValues.indexOf(correct),
  };
}

/** Create 4 unique 1-digit MCQ options for digit fill-in questions (0–9) */
function makeDigitOptions(correctDigit: number): { options: string[]; correctIndex: number } {
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const d = randInt(0, 9);
    if (d !== correctDigit) {
      distractors.add(d);
    }
  }

  const allValues = shuffle([correctDigit, ...distractors]);
  return {
    options: allValues.map(String),
    correctIndex: allValues.indexOf(correctDigit),
  };
}

/** Possibly convert a full-operand ? into a single-digit ? with ~50% probability.
 *  Returns updated values for missingPosition, missingDigitPlace, missingDigitRow, targetAnswer, isDigitTarget, and text. */
function maybeSingleDigitMissing(
  operand: number,
  missingPosition: 'top_operand' | 'bottom_operand',
  otherOperand: number,
  answer: number,
  operation: '+' | '-' | '×'
): {
  missingPosition: 'top_operand' | 'bottom_operand' | 'internal_digit';
  missingDigitPlace?: 'tens' | 'ones';
  missingDigitRow?: 'top' | 'bottom';
  targetAnswer: number;
  isDigitTarget: boolean;
  text: string;
} {
  // Only convert if operand is >= 10 (has both tens and ones digit)
  if (operand < 10 || Math.random() > 0.5) {
    // Keep as full-operand ?
    const opSymbol = operation === '×' ? '×' : operation;
    const text = missingPosition === 'top_operand'
      ? `(?) ${opSymbol} ${otherOperand} = ${answer}`
      : `${otherOperand} ${opSymbol} (?) = ${answer}`;
    return { missingPosition, targetAnswer: operand, isDigitTarget: false, text };
  }

  // Convert to single-digit ?
  const digitPlace: 'tens' | 'ones' = Math.random() > 0.5 ? 'tens' : 'ones';
  const digitRow: 'top' | 'bottom' = missingPosition === 'top_operand' ? 'top' : 'bottom';
  const targetDigit = digitPlace === 'tens' ? Math.floor(operand / 10) % 10 : operand % 10;
  const opSymbol = operation === '×' ? '×' : operation;

  // Build display text showing the partially-hidden operand
  let partialStr: string;
  if (digitPlace === 'tens') {
    partialStr = `(?)${operand % 10}`;
  } else {
    partialStr = `${Math.floor(operand / 10)}(?)`;
  }

  const text = missingPosition === 'top_operand'
    ? `${partialStr} ${opSymbol} ${otherOperand} = ${answer}`
    : `${otherOperand} ${opSymbol} ${partialStr} = ${answer}`;

  return {
    missingPosition: 'internal_digit',
    missingDigitPlace: digitPlace,
    missingDigitRow: digitRow,
    targetAnswer: targetDigit,
    isDigitTarget: true,
    text,
  };
}

// ---- Column Question Builder ----

function buildColumnData(
  a: number,
  b: number,
  operation: '+' | '-' | '×',
  missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit',
  missingDigitPlace?: 'hundreds' | 'tens' | 'ones',
  missingDigitRow?: 'top' | 'bottom'
): ColumnQuestion {
  let answer: number;
  if (operation === '+') answer = a + b;
  else if (operation === '-') answer = a - b;
  else answer = a * b;

  let hasRegrouping = false;
  if (operation === '+') {
    hasRegrouping = (a % 10) + (b % 10) >= 10;
  } else if (operation === '-') {
    hasRegrouping = (a % 10) < (b % 10);
  } else {
    hasRegrouping = (a % 10) * (b % 10) >= 10;
  }

  const result: ColumnQuestion = {
    type: 'column',
    operation,
    topNumber: a,
    bottomNumber: b,
    placeValues: {
      tens: { top: Math.floor(a / 10) % 10, bottom: Math.floor(b / 10) % 10 },
      ones: { top: a % 10, bottom: b % 10 },
    },
    answer,
    hasRegrouping,
    answerDigits: {
      tens: Math.floor(answer / 10) % 10,
      ones: answer % 10,
    },
    missingPosition,
    missingDigitPlace,
    missingDigitRow: missingDigitRow || (missingPosition === 'internal_digit' ? 'top' : undefined),
  };

  if (a >= 100 || b >= 100 || answer >= 100) {
    result.placeValues.hundreds = {
      top: a >= 100 ? Math.floor(a / 100) : null,
      bottom: b >= 100 ? Math.floor(b / 100) : null,
    };
    result.answerDigits.hundreds = answer >= 100 ? Math.floor(answer / 100) : 0;
  }

  return result;
}

// ============================================
// 1. ADDITION — Vertical Column with Dynamic (?)
// ============================================

function generateAddition(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number;
  let missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit';
  let missingDigitPlace: 'hundreds' | 'tens' | 'ones' | undefined;
  let missingDigitRow: 'top' | 'bottom' | undefined;
  let targetAnswer: number;
  let text = '';
  let isDigitTarget = false;

  switch (difficulty) {
    case 1: {
      // Easy: Missing final sum digit (24 + 15 = ?)
      a = randInt(10, 45);
      const maxOnes = 9 - (a % 10);
      b = randInt(1, Math.max(1, Math.min(maxOnes, 35)));
      missingPosition = 'answer';
      targetAnswer = a + b;
      text = `${a} + ${b} = (?)`;
      break;
    }
    case 2: {
      // Medium: Missing top/bottom operand or internal digit (e.g. 2? + 11 = 33 or ? + 15 = 39)
      const choice = randInt(1, 3);
      if (choice === 1) {
        a = randInt(12, 50);
        b = randInt(5, 40);
        const converted = maybeSingleDigitMissing(b, 'bottom_operand', a, a + b, '+');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else if (choice === 2) {
        a = randInt(12, 50);
        b = randInt(5, 40);
        const converted = maybeSingleDigitMissing(a, 'top_operand', b, a + b, '+');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else {
        a = randInt(20, 75);
        b = randInt(10, 20);
        missingPosition = 'internal_digit';
        missingDigitPlace = 'ones';
        targetAnswer = a % 10;
        isDigitTarget = true;
        text = `${Math.floor(a / 10)}(?) + ${b} = ${a + b}`;
      }
      break;
    }
    case 3: {
      // Hard: Multi-digit column with regrouping & missing operand or digit
      const choice = randInt(1, 2);
      a = randInt(25, 85);
      b = randInt(15, 95 - a);
      if ((a % 10) + (b % 10) < 10) {
        b = b - (b % 10) + randInt(10 - (a % 10), 9);
      }
      if (choice === 1) {
        const converted = maybeSingleDigitMissing(a, 'top_operand', b, a + b, '+');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else {
        missingPosition = 'internal_digit';
        missingDigitPlace = Math.random() > 0.5 ? 'tens' : 'ones';
        targetAnswer = missingDigitPlace === 'tens' ? Math.floor(a / 10) % 10 : a % 10;
        isDigitTarget = true;
        text = `Find missing digit in ${a} + ${b} = ${a + b}`;
      }
      break;
    }
    default:
      a = 12; b = 5; missingPosition = 'answer'; targetAnswer = 17; text = '12 + 5 = (?)';
  }

  const columnData = buildColumnData(a, b, '+', missingPosition, missingDigitPlace, missingDigitRow);
  const { options, correctIndex } = isDigitTarget
    ? makeDigitOptions(targetAnswer)
    : makeOptions(targetAnswer, String, Math.max(4, Math.ceil(targetAnswer * 0.25)));

  return {
    questionData: columnData,
    text,
    options,
    correctIndex,
    difficulty,
    skillName: 'Addition',
  };
}

// ============================================
// 2. SUBTRACTION — Vertical Column with Dynamic (?)
// ============================================

function generateSubtraction(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number;
  let missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit';
  let missingDigitPlace: 'hundreds' | 'tens' | 'ones' | undefined;
  let missingDigitRow: 'top' | 'bottom' | undefined;
  let targetAnswer: number;
  let text = '';
  let isDigitTarget = false;

  switch (difficulty) {
    case 1: {
      // Easy: Missing difference
      a = randInt(20, 50);
      b = randInt(1, a % 10 > 0 ? a % 10 : 9);
      missingPosition = 'answer';
      targetAnswer = a - b;
      text = `${a} - ${b} = (?)`;
      break;
    }
    case 2: {
      // Medium: Missing top operand (? - 15 = 24), bottom operand (39 - ? = 24), or internal digit
      const choice = randInt(1, 3);
      if (choice === 1) {
        a = randInt(30, 75);
        b = randInt(10, a - 10);
        const converted = maybeSingleDigitMissing(b, 'bottom_operand', a, a - b, '-');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else if (choice === 2) {
        a = randInt(30, 75);
        b = randInt(10, a - 10);
        const converted = maybeSingleDigitMissing(a, 'top_operand', b, a - b, '-');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else {
        a = randInt(30, 75);
        b = randInt(10, 20);
        missingPosition = 'internal_digit';
        missingDigitPlace = 'ones';
        targetAnswer = a % 10;
        isDigitTarget = true;
        text = `${Math.floor(a / 10)}(?) - ${b} = ${a - b}`;
      }
      break;
    }
    case 3: {
      // Hard: With borrowing, missing operand or digit
      a = randInt(40, 99);
      b = randInt(15, a - 5);
      if ((a % 10) >= (b % 10) && (a % 10) < 9) {
        b = b - (b % 10) + randInt(a % 10 + 1, 9);
        if (b >= a) b = a - 1;
      }
      const choice = randInt(1, 2);
      if (choice === 1) {
        const converted = maybeSingleDigitMissing(a, 'top_operand', b, a - b, '-');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else {
        missingPosition = 'internal_digit';
        missingDigitPlace = Math.random() > 0.5 ? 'tens' : 'ones';
        missingDigitRow = 'bottom';
        targetAnswer = missingDigitPlace === 'tens' ? Math.floor(b / 10) % 10 : b % 10;
        isDigitTarget = true;
        text = `Find missing digit in ${a} - ${b} = ${a - b}`;
      }
      break;
    }
    default:
      a = 25; b = 10; missingPosition = 'answer'; targetAnswer = 15; text = '25 - 10 = (?)';
  }

  const columnData = buildColumnData(a, b, '-', missingPosition, missingDigitPlace, missingDigitRow);
  const { options, correctIndex } = isDigitTarget
    ? makeDigitOptions(targetAnswer)
    : makeOptions(targetAnswer, String, Math.max(4, Math.ceil(targetAnswer * 0.25)));

  return {
    questionData: columnData,
    text,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
}

// ============================================
// 3. MULTIPLICATION — Vertical Column with Dynamic (?)
// ============================================

function generateMultiplication(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number;
  let missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit';
  let missingDigitPlace: 'hundreds' | 'tens' | 'ones' | undefined;
  let missingDigitRow: 'top' | 'bottom' | undefined;
  let targetAnswer: number;
  let text = '';
  let isDigitTarget = false;

  switch (difficulty) {
    case 1: {
      // Easy: Single-digit or simple vertical multiplication missing product (12 x 3 = ?)
      a = randInt(10, 25);
      b = randInt(2, 4);
      missingPosition = 'answer';
      targetAnswer = a * b;
      text = `${a} × ${b} = (?)`;
      break;
    }
    case 2: {
      // Medium: Missing multiplier (14 x ? = 42), missing multiplicand (? x 3 = 36), or internal digit
      const choice = randInt(1, 3);
      if (choice === 1) {
        a = randInt(11, 25);
        b = randInt(2, 5);
        // bottom_operand is single-digit (2-5), so no conversion needed — keep as full ?
        missingPosition = 'bottom_operand';
        targetAnswer = b;
        text = `${a} × (?) = ${a * b}`;
      } else if (choice === 2) {
        a = randInt(11, 25);
        b = randInt(2, 5);
        const converted = maybeSingleDigitMissing(a, 'top_operand', b, a * b, '×');
        missingPosition = converted.missingPosition;
        missingDigitPlace = converted.missingDigitPlace;
        if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
        targetAnswer = converted.targetAnswer;
        isDigitTarget = converted.isDigitTarget;
        text = converted.text;
      } else {
        a = randInt(12, 30);
        b = randInt(2, 4);
        missingPosition = 'internal_digit';
        missingDigitPlace = 'ones';
        missingDigitRow = 'top';
        targetAnswer = a % 10;
        isDigitTarget = true;
        text = `${Math.floor(a / 10)}(?) × ${b} = ${a * b}`;
      }
      break;
    }
    case 3: {
      // Hard: Missing multiplicand or multiplicand digit in vertical multiplication
      a = randInt(15, 35);
      b = randInt(3, 6);
      const converted = maybeSingleDigitMissing(a, 'top_operand', b, a * b, '×');
      missingPosition = converted.missingPosition;
      missingDigitPlace = converted.missingDigitPlace;
      if (converted.missingDigitRow) missingDigitRow = converted.missingDigitRow;
      targetAnswer = converted.targetAnswer;
      isDigitTarget = converted.isDigitTarget;
      text = converted.text;
      break;
    }
    default:
      a = 12; b = 3; missingPosition = 'answer'; targetAnswer = 36; text = '12 × 3 = (?)';
  }

  const columnData = buildColumnData(a, b, '×', missingPosition, missingDigitPlace, missingDigitRow);
  const { options, correctIndex } = isDigitTarget
    ? makeDigitOptions(targetAnswer)
    : makeOptions(targetAnswer, String, Math.max(4, Math.ceil(targetAnswer * 0.25)));

  return {
    questionData: columnData,
    text,
    options,
    correctIndex,
    difficulty,
    skillName: 'Multiplication',
  };
}

// ============================================
// 4. DIVISION — Step-by-Step Long Division format
// ============================================

/** Walk the long-division algorithm one dividend column at a time. */
function buildDivisionSteps(dividend: number, divisor: number): LongDivisionStep[] {
  const steps: LongDivisionStep[] = [];
  const digits = String(dividend);
  let currentVal = 0;

  for (let i = 0; i < digits.length; i++) {
    currentVal = currentVal * 10 + parseInt(digits[i], 10);
    const quotientDigit = Math.floor(currentVal / divisor);
    const product = quotientDigit * divisor;
    const subtractionResult = currentVal - product;
    steps.push({
      quotientDigit,
      product,
      subtractionResult,
      broughtDownDigit: i + 1 < digits.length ? parseInt(digits[i + 1], 10) : null,
    });
    currentVal = subtractionResult;
  }

  return steps;
}

/**
 * Steps the player can be asked to complete: not a leading column the divisor
 * doesn't go into, since those are skipped when writing the algorithm by hand.
 */
function solvableStepIndices(steps: LongDivisionStep[]): number[] {
  const first = steps.findIndex((s) => s.quotientDigit > 0);
  if (first < 0) return [steps.length - 1];
  return steps.map((_, i) => i).filter((i) => i >= first);
}

function generateDivision(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let divisor: number;
  let quotient: number;
  let dividend: number;

  switch (difficulty) {
    case 1:
      // Easy: two-digit quotient, divides exactly.
      divisor = randInt(2, 5);
      quotient = randInt(11, 49);
      dividend = divisor * quotient;
      break;
    case 2:
      // Medium: three-digit quotient, divides exactly.
      divisor = randInt(2, 4);
      quotient = randInt(101, 249);
      dividend = divisor * quotient;
      break;
    case 3:
      // Hard: leaves a remainder.
      divisor = randInt(3, 7);
      quotient = randInt(12, 89);
      dividend = divisor * quotient + randInt(1, divisor - 1);
      quotient = Math.floor(dividend / divisor);
      break;
    default:
      divisor = 3;
      quotient = 113;
      dividend = 339;
  }

  const steps = buildDivisionSteps(dividend, divisor);
  const remainder = dividend % divisor;
  const solvable = solvableStepIndices(steps);
  const lastStep = steps.length - 1;

  // Choose what the player supplies. `brought_down_digit` used to be an option
  // but the answer is printed in the dividend right above it, so it tested
  // nothing — `product` replaces it and exercises multiplication inside division.
  const candidates: DivisionTarget[] = [];
  if (difficulty === 1) {
    candidates.push('quotient_digit');
  } else if (difficulty === 2) {
    candidates.push('quotient_digit', 'product');
  } else {
    candidates.push('subtraction_result', 'product');
    if (remainder > 0) candidates.push('remainder');
  }
  const missingTarget = candidates[randInt(0, candidates.length - 1)];

  // `quotient_digit` and `remainder` are pinned to the final step; the others
  // pick any step whose work is actually written down.
  let missingStepIndex: number;
  if (missingTarget === 'quotient_digit' || missingTarget === 'remainder') {
    missingStepIndex = lastStep;
  } else {
    missingStepIndex = solvable[randInt(0, solvable.length - 1)];
  }

  const step = steps[missingStepIndex];
  let targetAnswer: number;
  let isDigitTarget = false;

  switch (missingTarget) {
    case 'quotient_digit':
      targetAnswer = step.quotientDigit;
      isDigitTarget = true;
      break;
    case 'product':
      targetAnswer = step.product;
      break;
    case 'subtraction_result':
      targetAnswer = step.subtractionResult;
      break;
    case 'remainder':
      targetAnswer = remainder;
      break;
  }

  const questionData: LongDivisionQuestion = {
    type: 'long_division',
    divisor,
    dividend,
    quotient,
    remainder,
    steps,
    missingTarget,
    missingStepIndex,
  };

  const { options, correctIndex } = isDigitTarget
    ? makeDigitOptions(targetAnswer)
    : makeOptions(targetAnswer, String, 3);

  return {
    questionData,
    text: `${dividend} ÷ ${divisor} — supply the ${missingTarget.replace(/_/g, ' ')}`,
    options,
    correctIndex,
    difficulty,
    skillName: 'Division',
  };
}

// ============================================
// CONTEXTUAL Generators (Game Mechanics)
// ============================================

export function generateDiceChallenge(
  die1: number,
  die2: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const useAddition = Math.random() > 0.3;
  if (useAddition) {
    const a = die1;
    const b = die2;
    const answer = a + b;
    const columnData = buildColumnData(a, b, '+', 'answer');
    const { options, correctIndex } = makeOptions(answer, String, 3);

    return {
      questionData: columnData,
      text: `${a} + ${b} = (?)`,
      options,
      correctIndex,
      difficulty: 1,
      skillName: 'Addition',
    };
  } else {
    const a = Math.max(die1, die2);
    const b = Math.min(die1, die2);
    const answer = a - b;
    const columnData = buildColumnData(a, b, '-', 'answer');
    const { options, correctIndex } = makeOptions(answer, String, 3);

    return {
      questionData: columnData,
      text: `${a} - ${b} = (?)`,
      options,
      correctIndex,
      difficulty: 1,
      skillName: 'Subtraction',
    };
  }
}

export function generateSmartBuyQuestion(
  propertyPrice: number,
  difficulty: 1 | 2 | 3,
  skillName?: string
): GeneratedQuestion {
  const targetSkill = skillName || 'Subtraction';
  return generateQuestion(targetSkill, difficulty);
}

export function generateRentDefenseQuestion(
  rentAmount: number,
  difficulty: 1 | 2 | 3,
  skillName?: string
): GeneratedQuestion {
  const targetSkill = skillName || 'Subtraction';
  return generateQuestion(targetSkill, difficulty);
}

// ============================================
// Master Generator Registry
// ============================================

const GENERATORS: Record<string, (difficulty: 1 | 2 | 3) => GeneratedQuestion> = {
  Addition: generateAddition,
  Subtraction: generateSubtraction,
  Multiplication: generateMultiplication,
  Division: generateDivision,
};

export function generateQuestion(
  skillName: string,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const generator = GENERATORS[skillName];
  if (!generator) {
    throw new Error(`Unknown skill: ${skillName}. Available: ${Object.keys(GENERATORS).join(', ')}`);
  }
  return generator(difficulty);
}

export function generateQuestionBank(
  questionsPerSkillPerDifficulty: number = 10
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const skills = Object.keys(GENERATORS);
  const difficulties: (1 | 2 | 3)[] = [1, 2, 3];

  for (const skill of skills) {
    for (const diff of difficulties) {
      for (let i = 0; i < questionsPerSkillPerDifficulty; i++) {
        questions.push(generateQuestion(skill, diff));
      }
    }
  }

  return questions;
}
