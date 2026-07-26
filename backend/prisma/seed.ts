// Prisma seed — the four skills the BKT engine tracks.
// Run with: npx prisma db seed
//
// There is no question bank to seed. Questions are generated at runtime by
// `src/bkt/question.generator.ts`, and each attempt stores the generated item
// inline. Skills exist as rows only so mastery states and attempts can
// foreign-key to a stable id.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Must stay in sync with SKILL_NAMES in src/features/game/game.constants.ts */
const SKILLS = [
  { name: 'Addition', description: 'Adding whole numbers using the vertical column method' },
  { name: 'Subtraction', description: 'Subtracting whole numbers, including regrouping' },
  { name: 'Multiplication', description: 'Multiplying by a single digit in column form' },
  { name: 'Division', description: 'Short and long division, including remainders' },
];

async function main() {
  console.log('Seeding skills...');

  for (const skill of SKILLS) {
    const record = await prisma.skill.upsert({
      where: { name: skill.name },
      update: { description: skill.description },
      create: skill,
    });
    console.log(`  ${skill.name} (${record.id})`);
  }

  const extras = await prisma.skill.findMany({
    where: { name: { notIn: SKILLS.map((s) => s.name) } },
    select: { name: true },
  });
  if (extras.length > 0) {
    console.warn(`Warning: unexpected skills present: ${extras.map((s) => s.name).join(', ')}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
