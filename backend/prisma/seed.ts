// Prisma seed script — populates the database with initial data
// Run with: npx prisma db seed

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// ---- Skills ----

const SKILLS = [
  { name: 'Addition', description: 'Adding whole numbers, decimals, and multi-digit numbers' },
  { name: 'Subtraction', description: 'Subtracting whole numbers, finding differences' },
  { name: 'Multiplication', description: 'Multiplying single and multi-digit numbers' },
  { name: 'Division', description: 'Dividing numbers evenly, finding quotients' },
  { name: 'Fractions', description: 'Understanding and calculating fractions of numbers' },
  { name: 'Decimals', description: 'Working with decimal numbers in arithmetic' },
];

// ---- Question Templates ----
// Each template generates questions with randomized values

interface QuestionTemplate {
  skillName: string;
  difficulty: number;
  generate: () => { text: string; options: string[]; correctIndex: number };
}

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

function makeOptions(correct: number, spread: number): { options: string[]; correctIndex: number } {
  const actualSpread = Math.max(3, spread);
  const distractors = new Set<number>();
  let attempts = 0;
  while (distractors.size < 3 && attempts < 100) {
    const offset = randInt(1, actualSpread) * (Math.random() > 0.5 ? 1 : -1);
    const d = correct + offset;
    if (d !== correct && d >= 0) distractors.add(d);
    attempts++;
  }
  // Fallback if not enough distractors
  while (distractors.size < 3) {
    distractors.add(correct + distractors.size + 1);
  }
  const allValues = shuffle([correct, ...distractors]);
  return {
    options: allValues.map(String),
    correctIndex: allValues.indexOf(correct),
  };
}

function createTemplates(): QuestionTemplate[] {
  const templates: QuestionTemplate[] = [];

  // ---- Addition ----
  templates.push({
    skillName: 'Addition', difficulty: 1,
    generate: () => {
      const a = randInt(5, 45), b = randInt(5, 45);
      const answer = a + b;
      const { options, correctIndex } = makeOptions(answer, 10);
      return { text: `What is ${a} + ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Addition', difficulty: 2,
    generate: () => {
      const a = randInt(100, 500), b = randInt(100, 499);
      const answer = a + b;
      const { options, correctIndex } = makeOptions(answer, 50);
      return { text: `What is ${a} + ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Addition', difficulty: 3,
    generate: () => {
      const a = randInt(500, 2000), b = randInt(500, 2000);
      const answer = a + b;
      const { options, correctIndex } = makeOptions(answer, 200);
      return { text: `What is ${a} + ${b}?`, options, correctIndex };
    },
  });

  // ---- Subtraction ----
  templates.push({
    skillName: 'Subtraction', difficulty: 1,
    generate: () => {
      const a = randInt(20, 90), b = randInt(5, a - 1);
      const answer = a - b;
      const { options, correctIndex } = makeOptions(answer, 10);
      return { text: `What is ${a} - ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Subtraction', difficulty: 2,
    generate: () => {
      const a = randInt(200, 800), b = randInt(50, a - 10);
      const answer = a - b;
      const { options, correctIndex } = makeOptions(answer, 50);
      return { text: `What is ${a} - ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Subtraction', difficulty: 3,
    generate: () => {
      const a = randInt(1000, 5000), b = randInt(200, a - 100);
      const answer = a - b;
      const { options, correctIndex } = makeOptions(answer, 200);
      return { text: `What is ${a} - ${b}?`, options, correctIndex };
    },
  });

  // ---- Multiplication ----
  templates.push({
    skillName: 'Multiplication', difficulty: 1,
    generate: () => {
      const a = randInt(2, 9), b = randInt(2, 9);
      const answer = a * b;
      const { options, correctIndex } = makeOptions(answer, 10);
      return { text: `What is ${a} × ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Multiplication', difficulty: 2,
    generate: () => {
      const a = randInt(11, 25), b = randInt(2, 9);
      const answer = a * b;
      const { options, correctIndex } = makeOptions(answer, 20);
      return { text: `What is ${a} × ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Multiplication', difficulty: 3,
    generate: () => {
      const a = randInt(12, 30), b = randInt(11, 20);
      const answer = a * b;
      const { options, correctIndex } = makeOptions(answer, 50);
      return { text: `What is ${a} × ${b}?`, options, correctIndex };
    },
  });

  // ---- Division ----
  templates.push({
    skillName: 'Division', difficulty: 1,
    generate: () => {
      const answer = randInt(2, 10), b = randInt(2, 9);
      const a = answer * b;
      const { options, correctIndex } = makeOptions(answer, 5);
      return { text: `What is ${a} ÷ ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Division', difficulty: 2,
    generate: () => {
      const answer = randInt(5, 20), b = randInt(3, 12);
      const a = answer * b;
      const { options, correctIndex } = makeOptions(answer, 8);
      return { text: `What is ${a} ÷ ${b}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Division', difficulty: 3,
    generate: () => {
      const answer = randInt(10, 40), b = randInt(5, 15);
      const a = answer * b;
      const { options, correctIndex } = makeOptions(answer, 12);
      return { text: `What is ${a} ÷ ${b}?`, options, correctIndex };
    },
  });

  // ---- Fractions ----
  templates.push({
    skillName: 'Fractions', difficulty: 1,
    generate: () => {
      const fracs = [{ n: 1, d: 2, l: '½' }, { n: 1, d: 4, l: '¼' }, { n: 3, d: 4, l: '¾' }];
      const f = fracs[randInt(0, fracs.length - 1)];
      const whole = randInt(2, 10) * f.d;
      const answer = (whole * f.n) / f.d;
      const { options, correctIndex } = makeOptions(answer, 10);
      return { text: `What is ${f.l} of ${whole}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Fractions', difficulty: 2,
    generate: () => {
      const fracs = [{ n: 1, d: 3, l: '⅓' }, { n: 2, d: 3, l: '⅔' }, { n: 2, d: 5, l: '⅖' }];
      const f = fracs[randInt(0, fracs.length - 1)];
      const whole = randInt(3, 20) * f.d;
      const answer = (whole * f.n) / f.d;
      const { options, correctIndex } = makeOptions(answer, 15);
      return { text: `What is ${f.l} of ${whole}?`, options, correctIndex };
    },
  });
  templates.push({
    skillName: 'Fractions', difficulty: 3,
    generate: () => {
      const fracs = [{ n: 3, d: 8, l: '⅜' }, { n: 5, d: 8, l: '⅝' }, { n: 4, d: 5, l: '⅘' }];
      const f = fracs[randInt(0, fracs.length - 1)];
      const whole = randInt(5, 30) * f.d;
      const answer = (whole * f.n) / f.d;
      const { options, correctIndex } = makeOptions(answer, 20);
      return { text: `What is ${f.l} of ${whole}?`, options, correctIndex };
    },
  });

  // ---- Decimals ----
  templates.push({
    skillName: 'Decimals', difficulty: 1,
    generate: () => {
      const a = randInt(2, 9), b = 10;
      const answer = a * 0.5;
      const { options, correctIndex } = makeOptions(answer, 3);
      return { text: `What is 0.5 × ${a * 2}?`, options: options.map(String), correctIndex };
    },
  });
  templates.push({
    skillName: 'Decimals', difficulty: 2,
    generate: () => {
      const a = randInt(10, 50) / 10;
      const b = randInt(10, 50) / 10;
      const answer = Math.round((a + b) * 10) / 10;
      const opts = makeOptions(answer * 10, 5);
      return {
        text: `What is ${a.toFixed(1)} + ${b.toFixed(1)}?`,
        options: opts.options.map((v) => (parseInt(v) / 10).toFixed(1)),
        correctIndex: opts.correctIndex,
      };
    },
  });
  templates.push({
    skillName: 'Decimals', difficulty: 3,
    generate: () => {
      const a = randInt(10, 50) / 10;
      const b = randInt(2, 9);
      const answer = Math.round(a * b * 10) / 10;
      const opts = makeOptions(answer * 10, 10);
      return {
        text: `What is ${a.toFixed(1)} × ${b}?`,
        options: opts.options.map((v) => (parseInt(v) / 10).toFixed(1)),
        correctIndex: opts.correctIndex,
      };
    },
  });

  return templates;
}

// ---- Main Seed Function ----

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create default admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@mathmonopoly.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@mathmonopoly.com',
      password: 'admin123', // In production, hash this
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin user created: ${adminUser.id}`);

  // 2. Create skills
  const skillRecords: Record<string, string> = {};
  for (const skill of SKILLS) {
    const record = await prisma.skill.upsert({
      where: { name: skill.name },
      update: { description: skill.description },
      create: { name: skill.name, description: skill.description },
    });
    skillRecords[skill.name] = record.id;
    console.log(`✅ Skill: ${skill.name} (${record.id})`);
  }

  // 3. Generate question bank
  const templates = createTemplates();
  const QUESTIONS_PER_TEMPLATE = 30; // 30 questions × 18 templates = 540 questions
  let totalQuestions = 0;

  for (const template of templates) {
    const skillId = skillRecords[template.skillName];
    if (!skillId) {
      console.warn(`⚠️ Skill not found: ${template.skillName}`);
      continue;
    }

    for (let i = 0; i < QUESTIONS_PER_TEMPLATE; i++) {
      const { text, options, correctIndex } = template.generate();

      await prisma.question.create({
        data: {
          text,
          options,
          correctIndex,
          difficulty: template.difficulty,
          skillId,
        },
      });
      totalQuestions++;
    }
  }

  console.log(`✅ Generated ${totalQuestions} questions (${templates.length} templates × ${QUESTIONS_PER_TEMPLATE} each)`);
  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
