// ============================================
// Question Generator — Universal Vertical Math & Dynamic (?) Placement
// 4 Core Skills: Addition, Subtraction, Multiplication, Division
// 100% Vertical Column Layout & Step-by-Step Long Division
// ============================================

import { ColumnQuestion, LongDivisionQuestion, LongDivisionStep, QuestionData } from '../features/game/game.types';

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
        missingPosition = 'bottom_operand';
        targetAnswer = b;
        text = `${a} + (?) = ${a + b}`;
      } else if (choice === 2) {
        a = randInt(12, 50);
        b = randInt(5, 40);
        missingPosition = 'top_operand';
        targetAnswer = a;
        text = `(?) + ${b} = ${a + b}`;
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
        missingPosition = 'top_operand';
        targetAnswer = a;
        text = `(?) + ${b} = ${a + b}`;
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

  const columnData = buildColumnData(a, b, '+', missingPosition, missingDigitPlace);
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
        missingPosition = 'bottom_operand';
        targetAnswer = b;
        text = `${a} - (?) = ${a - b}`;
      } else if (choice === 2) {
        a = randInt(30, 75);
        b = randInt(10, a - 10);
        missingPosition = 'top_operand';
        targetAnswer = a;
        text = `(?) - ${b} = ${a - b}`;
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
        missingPosition = 'top_operand';
        targetAnswer = a;
        text = `(?) - ${b} = ${a - b}`;
      } else {
        missingPosition = 'internal_digit';
        missingDigitPlace = Math.random() > 0.5 ? 'tens' : 'ones';
        targetAnswer = missingDigitPlace === 'tens' ? Math.floor(b / 10) % 10 : b % 10;
        isDigitTarget = true;
        text = `Find missing digit in ${a} - ${b} = ${a - b}`;
      }
      break;
    }
    default:
      a = 25; b = 10; missingPosition = 'answer'; targetAnswer = 15; text = '25 - 10 = (?)';
  }

  const columnData = buildColumnData(a, b, '-', missingPosition, missingDigitPlace);
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
        missingPosition = 'bottom_operand';
        targetAnswer = b;
        text = `${a} × (?) = ${a * b}`;
      } else if (choice === 2) {
        a = randInt(11, 25);
        b = randInt(2, 5);
        missingPosition = 'top_operand';
        targetAnswer = a;
        text = `(?) × ${b} = ${a * b}`;
      } else {
        a = randInt(12, 30);
        b = randInt(2, 4);
        missingPosition = 'internal_digit';
        missingDigitPlace = 'ones';
        targetAnswer = (a * b) % 10;
        isDigitTarget = true;
        text = `${a} × ${b} = ${Math.floor((a * b) / 10)}(?)`;
      }
      break;
    }
    case 3: {
      // Hard: Missing multiplicand or multiplicand digit in vertical multiplication
      a = randInt(15, 35);
      b = randInt(3, 6);
      missingPosition = 'top_operand';
      targetAnswer = a;
      text = `(?) × ${b} = ${a * b}`;
      break;
    }
    default:
      a = 12; b = 3; missingPosition = 'answer'; targetAnswer = 36; text = '12 × 3 = (?)';
  }

  const columnData = buildColumnData(a, b, '×', missingPosition, missingDigitPlace);
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

function generateDivision(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let divisor: number;
  let quotient: number;
  let dividend: number;
  let missingTarget: 'quotient_digit' | 'brought_down_digit' | 'subtraction_result' | 'remainder';
  let targetAnswer: number;
  let text = '';
  let isDigitTarget = true;
  let missingBroughtStepIdx: number | undefined;
  let needsStepCompute = false;

  switch (difficulty) {
    case 1: {
      // Easy: Basic vertical division missing final quotient digit (3 | 66 = 3?)
      divisor = randInt(2, 5);
      quotient = randInt(11, 33);
      dividend = divisor * quotient;
      missingTarget = 'quotient_digit';
      // Frontend always hides the LAST quotient digit
      targetAnswer = quotient % 10;
      text = `${dividend} ÷ ${divisor} = quotient missing digit (?)`;
      break;
    }
    case 2: {
      // Medium: Step-by-step missing last quotient digit or brought-down digit
      divisor = randInt(2, 5);
      quotient = randInt(111, 333);
      dividend = divisor * quotient;
      missingTarget = Math.random() > 0.5 ? 'quotient_digit' : 'brought_down_digit';
      if (missingTarget === 'quotient_digit') {
        // Frontend always hides the LAST quotient digit
        targetAnswer = quotient % 10;
      } else {
        // brought_down_digit: use the last digit of the dividend that gets brought down
        // Pick a valid step that has a broughtDownDigit (not the last step)
        const divStr = String(dividend);
        const lastBroughtIdx = divStr.length - 2; // second-to-last step has a brought-down digit
        targetAnswer = parseInt(divStr[divStr.length - 1], 10);
        missingBroughtStepIdx = Math.max(0, lastBroughtIdx);
      }
      text = `Long division: missing ${missingTarget} in ${dividend} ÷ ${divisor}`;
      break;
    }
    case 3: {
      // Hard: Step-by-step division missing intermediate subtraction result or final remainder
      divisor = randInt(3, 6);
      quotient = randInt(12, 45);
      const remainder = randInt(0, divisor - 1);
      dividend = divisor * quotient + remainder;
      missingTarget = Math.random() > 0.5 ? 'subtraction_result' : 'remainder';
      if (missingTarget === 'remainder') {
        targetAnswer = remainder;
      } else {
        // Will be computed after steps are generated
        targetAnswer = 0;
        needsStepCompute = true;
      }
      isDigitTarget = false;
      text = `Long division: missing ${missingTarget} in ${dividend} ÷ ${divisor}`;
      break;
    }
    default:
      divisor = 3; quotient = 113; dividend = 339;
      missingTarget = 'quotient_digit'; targetAnswer = 3;
      text = '339 ÷ 3 = ?';
  }

  const steps: LongDivisionStep[] = [];
  const divStr = String(dividend);
  let currentVal = 0;
  for (let i = 0; i < divStr.length; i++) {
    const d = parseInt(divStr[i], 10);
    currentVal = currentVal * 10 + d;
    const qDigit = Math.floor(currentVal / divisor);
    const prod = qDigit * divisor;
    const subRes = currentVal - prod;
    const nextDigit = i + 1 < divStr.length ? parseInt(divStr[i + 1], 10) : null;
    steps.push({
      quotientDigit: qDigit,
      product: prod,
      subtractionResult: subRes,
      broughtDownDigit: nextDigit,
    });
    currentVal = subRes;
  }

  // Compute missingStepIndex dynamically
  let computedStepIndex = steps.length - 1; // default to last step
  if (missingTarget === 'quotient_digit') {
    computedStepIndex = steps.length - 1; // last step = last quotient digit
  } else if (missingTarget === 'brought_down_digit') {
    computedStepIndex = missingBroughtStepIdx ?? Math.max(0, steps.length - 2);
  } else if (missingTarget === 'subtraction_result') {
    // Pick a step with a non-trivial subtraction result (prefer step index 1 if available)
    computedStepIndex = steps.length > 1 ? 1 : 0;
    if (needsStepCompute) {
      targetAnswer = steps[computedStepIndex].subtractionResult;
    }
  }

  const longDivisionData: LongDivisionQuestion = {
    type: 'long_division',
    divisor,
    dividend,
    quotient,
    remainder: dividend % divisor,
    steps,
    missingTarget,
    missingStepIndex: computedStepIndex,
  };

  const { options, correctIndex } = isDigitTarget
    ? makeDigitOptions(targetAnswer)
    : makeOptions(targetAnswer, String, 3);

  return {
    questionData: longDivisionData,
    text,
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
