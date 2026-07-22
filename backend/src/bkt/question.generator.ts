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
  const actualSpread = spread || Math.max(3, Math.ceil(Math.abs(correct) * 0.2));
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

// ---- Column Question Builder ----

function buildColumnData(
  a: number,
  b: number,
  operation: '+' | '-' | '×',
  missingPosition: 'answer' | 'top_operand' | 'bottom_operand' | 'internal_digit',
  missingDigitPlace?: 'hundreds' | 'tens' | 'ones'
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

  switch (difficulty) {
    case 1: {
      // Easy (P(L) < 0.40): Missing final answer digit
      a = randInt(10, 45);
      const maxOnes = 9 - (a % 10);
      b = randInt(1, Math.max(1, Math.min(maxOnes, 35)));
      missingPosition = 'answer';
      targetAnswer = a + b;
      text = `${a} + ${b} = (?)`;
      break;
    }
    case 2: {
      // Medium (0.40 <= P(L) < 0.75): Missing top/bottom operand or internal digit
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
        text = `${Math.floor(a / 10)}(?) + ${b} = ${a + b}`;
      }
      break;
    }
    case 3: {
      // Hard (P(L) >= 0.75): Multi-digit column with regrouping & missing internal digit
      a = randInt(25, 85);
      b = randInt(15, 95 - a);
      if ((a % 10) + (b % 10) < 10) {
        b = b - (b % 10) + randInt(10 - (a % 10), 9);
      }
      missingPosition = 'internal_digit';
      missingDigitPlace = Math.random() > 0.5 ? 'tens' : 'ones';
      targetAnswer = missingDigitPlace === 'tens' ? Math.floor(a / 10) % 10 : a % 10;
      text = `Vertical Add Carry: find missing digit in ${a} + ${b} = ${a + b}`;
      break;
    }
    default:
      a = 12; b = 5; missingPosition = 'answer'; targetAnswer = 17; text = '12 + 5 = (?)';
  }

  const columnData = buildColumnData(a, b, '+', missingPosition, missingDigitPlace);
  const { options, correctIndex } = makeOptions(targetAnswer, String, Math.max(3, Math.ceil(targetAnswer * 0.2)));

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

  switch (difficulty) {
    case 1: {
      a = randInt(20, 50);
      b = randInt(1, a % 10 > 0 ? a % 10 : 9);
      missingPosition = 'answer';
      targetAnswer = a - b;
      text = `${a} - ${b} = (?)`;
      break;
    }
    case 2: {
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
        text = `${Math.floor(a / 10)}(?) - ${b} = ${a - b}`;
      }
      break;
    }
    case 3: {
      a = randInt(40, 99);
      b = randInt(15, a - 5);
      if ((a % 10) >= (b % 10)) {
        b = b - (b % 10) + randInt(a % 10 + 1, 9);
        if (b >= a) b = a - 1;
      }
      missingPosition = 'internal_digit';
      missingDigitPlace = Math.random() > 0.5 ? 'tens' : 'ones';
      targetAnswer = missingDigitPlace === 'tens' ? Math.floor(b / 10) % 10 : b % 10;
      text = `Vertical Sub Borrow: find missing digit in ${a} - ${b} = ${a - b}`;
      break;
    }
    default:
      a = 25; b = 10; missingPosition = 'answer'; targetAnswer = 15; text = '25 - 10 = (?)';
  }

  const columnData = buildColumnData(a, b, '-', missingPosition, missingDigitPlace);
  const { options, correctIndex } = makeOptions(targetAnswer, String, Math.max(3, Math.ceil(targetAnswer * 0.2)));

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

  switch (difficulty) {
    case 1: {
      a = randInt(10, 24);
      b = randInt(2, 4);
      missingPosition = 'answer';
      targetAnswer = a * b;
      text = `${a} × ${b} = (?)`;
      break;
    }
    case 2: {
      const choice = randInt(1, 2);
      if (choice === 1) {
        a = randInt(11, 25);
        b = randInt(2, 5);
        missingPosition = 'bottom_operand';
        targetAnswer = b;
        text = `${a} × (?) = ${a * b}`;
      } else {
        a = randInt(12, 30);
        b = randInt(2, 4);
        missingPosition = 'internal_digit';
        missingDigitPlace = 'ones';
        targetAnswer = (a * b) % 10;
        text = `${a} × ${b} = ${Math.floor((a * b) / 10)}(?)`;
      }
      break;
    }
    case 3: {
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
  const { options, correctIndex } = makeOptions(targetAnswer, String, Math.max(3, Math.ceil(targetAnswer * 0.2)));

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

  switch (difficulty) {
    case 1: {
      divisor = randInt(2, 5);
      quotient = randInt(11, 33);
      dividend = divisor * quotient;
      missingTarget = 'quotient_digit';
      targetAnswer = quotient % 10;
      text = `${dividend} ÷ ${divisor} = quotient missing digit (?)`;
      break;
    }
    case 2: {
      divisor = randInt(2, 4);
      quotient = randInt(111, 333);
      dividend = divisor * quotient;
      missingTarget = Math.random() > 0.5 ? 'quotient_digit' : 'brought_down_digit';
      targetAnswer = missingTarget === 'quotient_digit'
        ? Math.floor(quotient / 10) % 10
        : Math.floor(dividend / 10) % 10;
      text = `Long division step: missing ${missingTarget} in ${dividend} ÷ ${divisor}`;
      break;
    }
    case 3: {
      divisor = randInt(3, 6);
      quotient = randInt(12, 45);
      const remainder = randInt(0, divisor - 1);
      dividend = divisor * quotient + remainder;
      missingTarget = Math.random() > 0.5 ? 'subtraction_result' : 'remainder';
      targetAnswer = missingTarget === 'remainder' ? remainder : 0;
      text = `Long division: missing ${missingTarget} in ${dividend} ÷ ${divisor}`;
      break;
    }
    default:
      divisor = 3; quotient = 113; dividend = 339;
      missingTarget = 'quotient_digit'; targetAnswer = 1;
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

  const longDivisionData: LongDivisionQuestion = {
    type: 'long_division',
    divisor,
    dividend,
    quotient,
    remainder: dividend % divisor,
    steps,
    missingTarget,
    missingStepIndex: 1,
  };

  const { options, correctIndex } = makeOptions(targetAnswer, String, 3);

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
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const discountAmount = Math.floor(propertyPrice * 0.20);
  const answer = propertyPrice - discountAmount;
  const columnData = buildColumnData(propertyPrice, discountAmount, '-', 'answer');
  const { options, correctIndex } = makeOptions(answer, (n) => `RM${n}`, Math.max(5, Math.ceil(answer * 0.1)));

  return {
    questionData: columnData,
    text: `Smart Buy 20% Off: RM${propertyPrice} - RM${discountAmount} = (?)`,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
}

export function generateRentDefenseQuestion(
  rentAmount: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const halfRent = Math.floor(rentAmount / 2);
  const columnData = buildColumnData(rentAmount, halfRent, '-', 'answer');
  const { options, correctIndex } = makeOptions(halfRent, (n) => `RM${n}`, Math.max(3, Math.ceil(halfRent * 0.2)));

  return {
    questionData: columnData,
    text: `Rent Defense: Pay half of RM${rentAmount} = (?)`,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
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
