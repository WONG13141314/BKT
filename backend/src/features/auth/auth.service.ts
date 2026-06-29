import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { z } from 'zod';
import { joinGameSchema } from './auth.validation';
import { Role } from '@prisma/client';

type JoinGameInput = z.infer<typeof joinGameSchema>;

const generateToken = (userId: string) => {
  return jwt.sign({ userId }, env.JWT_SECRET as string, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
};

export const authService = {
  joinGuest: async (data: JoinGameInput) => {
    // Create an anonymous guest user
    const user = await prisma.user.create({
      data: {
        name: data.name,
        role: Role.GUEST,
      },
    });

    const token = generateToken(user.id);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, token };
  }
};
