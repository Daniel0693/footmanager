import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: number;
    clubId: number;
    firstName: string;
    lastName: string;
    phone?: string;
    avatarUrl?: string;
  }) {
    return this.prisma.member.create({ data });
  }

  findByUserAndClub(userId: number, clubId: number) {
    return this.prisma.member.findUnique({ where: { userId_clubId: { userId, clubId } } });
  }

  findById(id: number) {
    return this.prisma.member.findUnique({ where: { id }, include: { memberRoles: true } });
  }
}
