// ============================================
// Programmatic Question Bank Generator
// Generates math questions using templates with randomized values
// 6 Skills × 3 Difficulties × ~30 questions each = ~540 questions
// ============================================

export interface GeneratedQuestion {
  text: string;
  options: string[];
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
 * Creates 4 multiple-choice options from a correct answer
 * Generates 3 plausible distractors near the correct value
 */
function makeOptions(correct: number, spread: number = 0): string[] {
  const actualSpread = spread || Math.max(5, Math.ceil(Math.abs(correct) * 0.3));
  const distractors = new Set<number>();

  // Generate unique distractors
  while (distractors.size < 3) {
    const offset = randInt(1, actualSpread) * (Math.random() > 0.5 ? 1 : -1);
    const distractor = correct + offset;
    if (distractor !== correct && distractor >= 0) {
      distractors.add(distractor);
    }
  }

  const options = [correct, ...distractors];
  const shuffled = shuffle(options);
  const correctIndex = shuffled.indexOf(correct);

  return [
    ...shuffled.map((n) => formatNumber(n)),
    String(correctIndex),
  ];
}

/**
 * Creates options with string formatting (for money, fractions, etc.)
 */
function makeOptionsFormatted(
  correct: number,
  formatter: (n: number) => string,
  spread?: number
): { options: string[]; correctIndex: number } {
  const actualSpread = spread || Math.max(5, Math.ceil(Math.abs(correct) * 0.3));
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

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatMoney(n: number): string {
  return `$${n}`;
}

// ============================================
// ADDITION Questions
// ============================================

function generateAddition(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number, answer: number, text: string;

  switch (difficulty) {
    case 1: // Easy: single/double digit, sum < 100
      a = randInt(5, 45);
      b = randInt(5, 45);
      answer = a + b;
      text = `What is ${a} + ${b}?`;
      break;
    case 2: // Medium: three-digit numbers
      a = randInt(100, 500);
      b = randInt(100, 499);
      answer = a + b;
      text = `What is ${a} + ${b}?`;
      break;
    case 3: // Hard: large numbers or multi-step
      a = randInt(500, 2000);
      b = randInt(500, 2000);
      answer = a + b;
      text = `What is ${a} + ${b}?`;
      break;
    default:
      a = 1; b = 1; answer = 2; text = `What is 1 + 1?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(answer, formatNumber, Math.max(10, Math.ceil(answer * 0.15)));

  return { text, options, correctIndex, difficulty, skillName: 'Addition' };
}

// ============================================
// SUBTRACTION Questions
// ============================================

function generateSubtraction(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number, answer: number, text: string;

  switch (difficulty) {
    case 1:
      a = randInt(20, 90);
      b = randInt(5, a - 1);
      answer = a - b;
      text = `What is ${a} - ${b}?`;
      break;
    case 2:
      a = randInt(200, 800);
      b = randInt(50, a - 10);
      answer = a - b;
      text = `What is ${a} - ${b}?`;
      break;
    case 3:
      a = randInt(1000, 5000);
      b = randInt(200, a - 100);
      answer = a - b;
      text = `What is ${a} - ${b}?`;
      break;
    default:
      a = 10; b = 5; answer = 5; text = `What is 10 - 5?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(answer, formatNumber, Math.max(10, Math.ceil(answer * 0.2)));

  return { text, options, correctIndex, difficulty, skillName: 'Subtraction' };
}

// ============================================
// MULTIPLICATION Questions
// ============================================

function generateMultiplication(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number, answer: number, text: string;

  switch (difficulty) {
    case 1: // Single × single
      a = randInt(2, 9);
      b = randInt(2, 9);
      answer = a * b;
      text = `What is ${a} × ${b}?`;
      break;
    case 2: // Double × single
      a = randInt(11, 25);
      b = randInt(2, 9);
      answer = a * b;
      text = `What is ${a} × ${b}?`;
      break;
    case 3: // Double × double
      a = randInt(12, 30);
      b = randInt(11, 20);
      answer = a * b;
      text = `What is ${a} × ${b}?`;
      break;
    default:
      a = 3; b = 4; answer = 12; text = `What is 3 × 4?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(answer, formatNumber, Math.max(5, Math.ceil(answer * 0.2)));

  return { text, options, correctIndex, difficulty, skillName: 'Multiplication' };
}

// ============================================
// DIVISION Questions
// ============================================

function generateDivision(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let a: number, b: number, answer: number, text: string;

  switch (difficulty) {
    case 1: // Simple, clean division
      answer = randInt(2, 10);
      b = randInt(2, 9);
      a = answer * b; // Ensure clean division
      text = `What is ${a} ÷ ${b}?`;
      break;
    case 2:
      answer = randInt(5, 20);
      b = randInt(3, 12);
      a = answer * b;
      text = `What is ${a} ÷ ${b}?`;
      break;
    case 3:
      answer = randInt(10, 40);
      b = randInt(5, 15);
      a = answer * b;
      text = `What is ${a} ÷ ${b}?`;
      break;
    default:
      a = 12; b = 4; answer = 3; text = `What is 12 ÷ 4?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(answer, formatNumber, Math.max(3, Math.ceil(answer * 0.3)));

  return { text, options, correctIndex, difficulty, skillName: 'Division' };
}

// ============================================
// FRACTIONS Questions
// ============================================

function generateFractions(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let answer: number, text: string;

  switch (difficulty) {
    case 1: { // Simple: half, quarter of round numbers
      const fractions = [
        { num: 1, den: 2, label: '½' },
        { num: 1, den: 4, label: '¼' },
        { num: 3, den: 4, label: '¾' },
      ];
      const frac = fractions[randInt(0, fractions.length - 1)];
      const whole = randInt(2, 10) * frac.den; // Ensure clean result
      answer = (whole * frac.num) / frac.den;
      text = `What is ${frac.label} of ${whole}?`;
      break;
    }
    case 2: { // Medium: varied fractions
      const fractions = [
        { num: 1, den: 3, label: '⅓' },
        { num: 2, den: 3, label: '⅔' },
        { num: 3, den: 4, label: '¾' },
        { num: 1, den: 5, label: '⅕' },
        { num: 2, den: 5, label: '⅖' },
      ];
      const frac = fractions[randInt(0, fractions.length - 1)];
      const whole = randInt(3, 20) * frac.den;
      answer = (whole * frac.num) / frac.den;
      text = `What is ${frac.label} of ${whole}?`;
      break;
    }
    case 3: { // Hard: larger numbers, less common fractions
      const fractions = [
        { num: 3, den: 8, label: '⅜' },
        { num: 5, den: 8, label: '⅝' },
        { num: 7, den: 8, label: '⅞' },
        { num: 2, den: 3, label: '⅔' },
        { num: 4, den: 5, label: '⅘' },
      ];
      const frac = fractions[randInt(0, fractions.length - 1)];
      const whole = randInt(5, 30) * frac.den;
      answer = (whole * frac.num) / frac.den;
      text = `What is ${frac.label} of ${whole}?`;
      break;
    }
    default:
      answer = 50; text = `What is ½ of 100?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(answer, formatNumber, Math.max(5, Math.ceil(answer * 0.25)));

  return { text, options, correctIndex, difficulty, skillName: 'Fractions' };
}

// ============================================
// DECIMALS Questions
// ============================================

function generateDecimals(difficulty: 1 | 2 | 3): GeneratedQuestion {
  let answer: number, text: string;

  switch (difficulty) {
    case 1: { // Simple decimal × whole
      const decimal = [0.5, 0.25, 0.1, 0.2][randInt(0, 3)];
      const whole = randInt(4, 20) * (1 / decimal); // Clean result
      const cleanWhole = Math.round(whole);
      answer = Math.round(decimal * cleanWhole);
      text = `What is ${decimal} × ${cleanWhole}?`;
      break;
    }
    case 2: { // Decimal addition
      const a = randInt(10, 99) / 10; // 1.0–9.9
      const b = randInt(10, 99) / 10;
      answer = Math.round((a + b) * 10) / 10;
      text = `What is ${a.toFixed(1)} + ${b.toFixed(1)}?`;
      break;
    }
    case 3: { // Decimal multiplication
      const a = randInt(10, 50) / 10; // 1.0–5.0
      const b = randInt(2, 9);
      answer = Math.round(a * b * 10) / 10;
      text = `What is ${a.toFixed(1)} × ${b}?`;
      break;
    }
    default:
      answer = 5; text = `What is 0.5 × 10?`;
  }

  const { options, correctIndex } = makeOptionsFormatted(
    answer,
    (n) => Number.isInteger(n) ? String(n) : n.toFixed(1),
    Math.max(2, Math.ceil(Math.abs(answer) * 0.3))
  );

  return { text, options, correctIndex, difficulty, skillName: 'Decimals' };
}

// ============================================
// Contextual Question Generators
// Generate questions using real game values
// ============================================

/**
 * Generate a buying property question using actual game prices
 */
export function generateBuyPropertyQuestion(
  playerMoney: number,
  propertyPrice: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const answer = playerMoney - propertyPrice;
  const text = `You have $${playerMoney} and this property costs $${propertyPrice}. How much will you have left?`;

  const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, Math.max(10, Math.ceil(answer * 0.15)));

  return { text, options, correctIndex, difficulty, skillName: 'Subtraction' };
}

/**
 * Generate a rent payment question using actual rent values
 */
export function generateRentQuestion(
  baseRent: number,
  houses: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  if (houses === 0 || difficulty === 1) {
    // Simple: just identify the rent
    const answer = baseRent * (1 + houses);
    const text = houses > 0
      ? `Rent is $${baseRent} per house. There are ${houses} houses. What is the total rent?`
      : `The base rent for this property is $${baseRent}. How much do you pay?`;

    const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, Math.max(10, Math.ceil(answer * 0.2)));
    return { text, options, correctIndex, difficulty, skillName: 'Multiplication' };
  }

  // Medium/Hard: multiplication
  const answer = baseRent * (1 + houses);
  const text = `Base rent is $${baseRent}. With ${houses} houses, rent is base × ${1 + houses}. What is $${baseRent} × ${1 + houses}?`;

  const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, Math.max(15, Math.ceil(answer * 0.15)));
  return { text, options, correctIndex, difficulty, skillName: 'Multiplication' };
}

/**
 * Generate a tax calculation question
 */
export function generateTaxQuestion(
  totalAssets: number,
  taxType: 'INCOME' | 'LUXURY',
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  if (taxType === 'INCOME') {
    const percent = 10;
    const answer = Math.round(totalAssets * percent / 100);
    const text = `Income Tax: Pay ${percent}% of your total assets ($${totalAssets}). What is ${percent}% of $${totalAssets}?`;

    const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, Math.max(10, Math.ceil(answer * 0.2)));
    return { text, options, correctIndex, difficulty, skillName: 'Decimals' };
  } else {
    const luxuryTax = 75;
    if (difficulty === 1) {
      const text = `Luxury Tax is $${luxuryTax}. If you get a 50% discount, how much do you pay?`;
      const answer = Math.round(luxuryTax / 2);
      const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, 10);
      return { text, options, correctIndex, difficulty, skillName: 'Division' };
    }
    const text = `Luxury Tax is $${luxuryTax}. What is half of $${luxuryTax}? (Round down)`;
    const answer = Math.floor(luxuryTax / 2);
    const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, 10);
    return { text, options, correctIndex, difficulty, skillName: 'Division' };
  }
}

/**
 * Generate a house building question
 */
export function generateBuildHouseQuestion(
  houseCost: number,
  numHouses: number,
  difficulty: 1 | 2 | 3
): GeneratedQuestion {
  const answer = houseCost * numHouses;
  const text = `Each house costs $${houseCost}. You want to build ${numHouses} house${numHouses > 1 ? 's' : ''}. Total cost?`;

  const { options, correctIndex } = makeOptionsFormatted(answer, formatMoney, Math.max(10, Math.ceil(answer * 0.2)));
  return { text, options, correctIndex, difficulty, skillName: 'Multiplication' };
}

// ============================================
// Master Generator
// ============================================

const GENERATORS: Record<string, (difficulty: 1 | 2 | 3) => GeneratedQuestion> = {
  Addition: generateAddition,
  Subtraction: generateSubtraction,
  Multiplication: generateMultiplication,
  Division: generateDivision,
  Fractions: generateFractions,
  Decimals: generateDecimals,
};

/**
 * Generate a question for a specific skill and difficulty
 */
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

/**
 * Generate a batch of questions for database seeding
 * @param questionsPerSkillPerDifficulty Number of questions to generate per skill per difficulty level
 */
export function generateQuestionBank(
  questionsPerSkillPerDifficulty: number = 30
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
