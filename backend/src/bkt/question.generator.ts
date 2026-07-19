// ============================================
// Question Generator — Standard 1 KSSR
// 4 Skills: Addition, Subtraction, Place Value, Money
// Column/vertical method rendering for Add/Sub
// All currency in RM
// ============================================

import { ColumnQuestion, McqQuestion, QuestionData } from '../features/game/game.types';

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

/**
 * Create 4 MCQ options from a correct number answer.
 * Distractors are nearby plausible values.
 */
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

// ---- Column Question Helper ----

function buildColumnData(
  a: number,
  b: number,
  operation: '+' | '-'
): ColumnQuestion {
  const answer = operation === '+' ? a + b : a - b;
  const hasRegrouping = operation === '+'
    ? (a % 10) + (b % 10) >= 10
    : (a % 10) < (b % 10);

  const result: ColumnQuestion = {
    type: 'column',
    operation,
    topNumber: a,
    bottomNumber: b,
    placeValues: {
      tens: { top: Math.floor(a / 10), bottom: Math.floor(b / 10) },
      ones: { top: a % 10, bottom: b % 10 },
    },
    answer,
    hasRegrouping,
    answerDigits: {
      tens: Math.floor(answer / 10),
      ones: answer % 10,
    },
  };

  // Add hundreds column if any number >= 100
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
// ADDITION — Column/Vertical Method
// ============================================

function generateAddition(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number;

  switch (difficulty) {
    case 1: {
      // Within 20, NO regrouping — ones digits sum < 10
      a = randInt(10, 15);
      const maxOnes = 9 - (a % 10);
      b = randInt(1, Math.max(1, Math.min(maxOnes, 9)));
      break;
    }
    case 2: {
      // Within 50, NO regrouping
      a = randInt(10, 40);
      const maxB = 49 - a;
      const maxOnes = 9 - (a % 10);
      b = randInt(1, Math.max(1, Math.min(maxB, 39)));
      // Ensure no regrouping
      if ((a % 10) + (b % 10) >= 10) {
        b = b - (b % 10) + randInt(0, Math.max(0, 9 - (a % 10)));
      }
      if (b <= 0) b = 1;
      break;
    }
    case 3: {
      // Within 100, WITH regrouping
      a = randInt(15, 85);
      b = randInt(5, 99 - a);
      // Force regrouping: ones must sum >= 10
      const onesA = a % 10;
      const onesB = b % 10;
      if (onesA + onesB < 10) {
        // Adjust b's ones digit to force carry
        const newOnesB = randInt(10 - onesA, 9);
        b = b - onesB + newOnesB;
        if (a + b > 100) b = 100 - a;
      }
      if (b <= 0) b = 5;
      break;
    }
    default:
      a = 12; b = 5;
  }

  const answer = a + b;
  const columnData = buildColumnData(a, b, '+');
  const { options, correctIndex } = makeOptions(answer, String, Math.max(3, Math.ceil(answer * 0.15)));

  return {
    questionData: columnData,
    text: `${a} + ${b} = ?`,
    options,
    correctIndex,
    difficulty,
    skillName: 'Addition',
  };
}

// ============================================
// SUBTRACTION — Column/Vertical Method
// ============================================

function generateSubtraction(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number;

  switch (difficulty) {
    case 1: {
      // Within 20, NO borrowing — ones digit a >= ones digit b
      a = randInt(11, 19);
      const maxOnesB = a % 10;
      b = randInt(1, Math.max(1, maxOnesB));
      break;
    }
    case 2: {
      // Within 50, NO borrowing
      a = randInt(20, 49);
      b = randInt(1, a - 10);
      // Ensure no borrowing
      if ((a % 10) < (b % 10)) {
        const newOnesB = randInt(0, a % 10);
        b = b - (b % 10) + newOnesB;
      }
      if (b <= 0) b = 1;
      break;
    }
    case 3: {
      // Within 100, WITH borrowing
      a = randInt(30, 99);
      b = randInt(5, a - 5);
      // Force borrowing: ones digit a < ones digit b
      const onesA = a % 10;
      const onesB = b % 10;
      if (onesA >= onesB) {
        const newOnesB = randInt(onesA + 1, 9);
        b = b - onesB + newOnesB;
        if (b >= a) b = a - 1;
      }
      if (b <= 0) b = 5;
      break;
    }
    default:
      a = 18; b = 5;
  }

  const answer = a - b;
  const columnData = buildColumnData(a, b, '-');
  const { options, correctIndex } = makeOptions(answer, String, Math.max(3, Math.ceil(answer * 0.2)));

  return {
    questionData: columnData,
    text: `${a} - ${b} = ?`,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
}

// ============================================
// PLACE VALUE — MCQ Format
// ============================================

function generatePlaceValue(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let text: string;
  let answer: number;
  let optionStrings: string[];
  let correctIdx: number;

  switch (difficulty) {
    case 1: {
      // Identify ones or tens digit in a 2-digit number
      const num = randInt(11, 99);
      const askOnes = Math.random() > 0.5;
      if (askOnes) {
        text = `What is the digit in the ONES place of ${num}?`;
        answer = num % 10;
      } else {
        text = `What is the digit in the TENS place of ${num}?`;
        answer = Math.floor(num / 10);
      }
      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(answer, String, 3));
      break;
    }
    case 2: {
      // Compose a number from tens and ones
      const tens = randInt(1, 9);
      const ones = randInt(0, 9);
      answer = tens * 10 + ones;
      text = `${tens} tens and ${ones} ones = ?`;
      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(answer, String, 10));
      break;
    }
    case 3: {
      // Compare two 2-digit numbers — which is bigger/smaller?
      const num1 = randInt(10, 99);
      let num2 = randInt(10, 99);
      while (num2 === num1) num2 = randInt(10, 99);

      const askBigger = Math.random() > 0.5;
      if (askBigger) {
        text = `Which number is BIGGER: ${num1} or ${num2}?`;
        answer = Math.max(num1, num2);
      } else {
        text = `Which number is SMALLER: ${num1} or ${num2}?`;
        answer = Math.min(num1, num2);
      }
      // Custom options: the two numbers + 2 distractors
      const distractors = new Set<number>();
      while (distractors.size < 2) {
        const d = randInt(10, 99);
        if (d !== num1 && d !== num2 && d !== answer) distractors.add(d);
      }
      const allOpts = shuffle([num1, num2, ...distractors]);
      optionStrings = allOpts.map(String);
      correctIdx = allOpts.indexOf(answer);
      break;
    }
    default:
      text = 'What is the digit in the ONES place of 25?';
      answer = 5;
      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(5, String, 3));
  }

  const mcqData: McqQuestion = { type: 'mcq', text };

  return {
    questionData: mcqData,
    text,
    options: optionStrings,
    correctIndex: correctIdx,
    difficulty,
    skillName: 'PlaceValue',
  };
}

// ============================================
// MONEY — MCQ Format (RM / Sen)
// ============================================

function generateMoney(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let text: string;
  let answer: number;
  let optionStrings: string[];
  let correctIdx: number;

  switch (difficulty) {
    case 1: {
      // Recognize RM notes — "Which note is worth RM__?"
      const notes = [1, 5, 10, 20, 50];
      answer = notes[randInt(0, notes.length - 1)];
      const templates = [
        `How much is a blue RM${answer} note worth?`,
        `Ali has one RM${answer} note. How much money does he have?`,
        `Which amount is shown on an RM${answer} note?`,
      ];
      text = templates[randInt(0, templates.length - 1)];

      // Options: the correct note + 3 other note values
      const others = notes.filter((n) => n !== answer);
      const distractors = shuffle(others).slice(0, 3);
      const allOpts = shuffle([answer, ...distractors]);
      optionStrings = allOpts.map((n) => `RM${n}`);
      correctIdx = allOpts.indexOf(answer);
      break;
    }
    case 2: {
      // Count mixed coins/notes up to RM20
      // e.g. "You have one RM5 note and three RM1 coins. How much total?"
      const fives = randInt(0, 3);
      const ones = randInt(0, 5);
      const tens = randInt(0, 1);
      answer = tens * 10 + fives * 5 + ones * 1;
      if (answer === 0) { answer = 5; } // Prevent RM0

      const parts: string[] = [];
      if (tens > 0) parts.push(`${tens} RM10 note${tens > 1 ? 's' : ''}`);
      if (fives > 0) parts.push(`${fives} RM5 note${fives > 1 ? 's' : ''}`);
      if (ones > 0) parts.push(`${ones} RM1 coin${ones > 1 ? 's' : ''}`);
      text = `You have ${parts.join(' and ')}. How much total?`;

      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(answer, (n) => `RM${n}`, 5));
      break;
    }
    case 3: {
      // Making change — "You buy something for RM__ and pay with RM__. How much change?"
      const prices = [3, 7, 8, 12, 15, 18, 22, 25, 35, 42];
      const price = prices[randInt(0, prices.length - 1)];
      // Pick a reasonable note to pay with
      const payWith = price <= 10 ? 10 : price <= 20 ? 20 : price <= 50 ? 50 : 100;
      answer = payWith - price;

      text = `You buy a pencil case for RM${price} and pay with RM${payWith}. How much change do you get?`;
      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(answer, (n) => `RM${n}`, 5));
      break;
    }
    default:
      text = 'How much is a RM5 note worth?';
      answer = 5;
      ({ options: optionStrings, correctIndex: correctIdx } = makeOptions(5, (n) => `RM${n}`, 3));
  }

  const mcqData: McqQuestion = { type: 'mcq', text };

  return {
    questionData: mcqData,
    text,
    options: optionStrings,
    correctIndex: correctIdx,
    difficulty,
    skillName: 'Money',
  };
}

// ============================================
// DICE CHALLENGE Generator
// Uses actual rolled dice values — Addition/Subtraction only (Std 1)
// ============================================

export function generateDiceChallenge(
  die1: number,
  die2: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  // For Std 1: only addition and subtraction with dice values
  const useAddition = Math.random() > 0.3; // Slightly favor addition

  if (useAddition) {
    const answer = die1 + die2;
    const columnData = buildColumnData(die1, die2, '+');
    const { options, correctIndex } = makeOptions(answer, String, 3);

    return {
      questionData: columnData,
      text: `${die1} + ${die2} = ?`,
      options,
      correctIndex,
      difficulty: 1, // Dice challenges are always easy (single digits)
      skillName: 'Addition',
    };
  } else {
    const a = Math.max(die1, die2);
    const b = Math.min(die1, die2);
    const answer = a - b;
    const columnData = buildColumnData(a, b, '-');
    const { options, correctIndex } = makeOptions(answer, String, 3);

    return {
      questionData: columnData,
      text: `${a} - ${b} = ?`,
      options,
      correctIndex,
      difficulty: 1,
      skillName: 'Subtraction',
    };
  }
}

// ============================================
// CONTEXTUAL Generators (use real game values)
// ============================================

/** Smart Buy: "Property costs RM120. With 20% discount, how much do you pay?" */
export function generateSmartBuyQuestion(
  propertyPrice: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const discountAmount = Math.floor(propertyPrice * 0.20);
  const answer = propertyPrice - discountAmount;

  const text = `This property costs RM${propertyPrice}. With a 20% Smart Buy discount, how much do you pay?`;
  const columnData = buildColumnData(propertyPrice, discountAmount, '-');
  const { options, correctIndex } = makeOptions(answer, (n) => `RM${n}`, Math.max(5, Math.ceil(answer * 0.1)));

  return {
    questionData: columnData,
    text,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
}

/** Rent Defense: "Rent is RM50. Half of RM50 is...?" */
export function generateRentDefenseQuestion(
  rentAmount: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const answer = Math.floor(rentAmount / 2);

  const text = `Rent is RM${rentAmount}. If you pay half, how much is that?`;
  const mcqData: McqQuestion = { type: 'mcq', text };
  const { options, correctIndex } = makeOptions(answer, (n) => `RM${n}`, Math.max(3, Math.ceil(answer * 0.2)));

  return {
    questionData: mcqData,
    text,
    options,
    correctIndex,
    difficulty,
    skillName: 'Subtraction',
  };
}

// ============================================
// Master Generator
// ============================================

const GENERATORS: Record<string, (difficulty: 1 | 2 | 3) => GeneratedQuestion> = {
  Addition: generateAddition,
  Subtraction: generateSubtraction,
  PlaceValue: generatePlaceValue,
  Money: generateMoney,
};

/** Generate a question for a specific skill and difficulty */
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

/** Generate a batch of questions (for testing/seeding) */
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
