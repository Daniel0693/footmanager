import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublicUser = Pick<
  User,
  'id' | 'email' | 'locale' | 'emailVerified' | 'createdAt'
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { email: string; passwordHash: string; locale?: string }) {
    return this.prisma.user.create({ data });
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      locale: user.locale,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}
