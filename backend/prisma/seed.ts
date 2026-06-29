// Prisma seed script — populates the database with initial data
// Run with: npx prisma db seed

// import { PrismaClient, Role } from '@prisma/client';
// import bcrypt from 'bcryptjs';

// const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // TODO: Create default admin user
  // const adminPassword = await bcrypt.hash('admin123', 10);
  // await prisma.user.upsert({
  //   where: { email: 'admin@mathmonopoly.com' },
  //   update: {},
  //   create: {
  //     name: 'Admin',
  //     email: 'admin@mathmonopoly.com',
  //     password: adminPassword,
  //     role: Role.ADMIN,
  //   },
  // });

  // TODO: Create default math skills
  // const skills = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Fractions', 'Decimals'];

  // TODO: Create starter question bank

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  });
