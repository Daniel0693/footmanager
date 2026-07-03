import { HttpStatus, Injectable } from '@nestjs/common';
import type { Gender } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId?: number;
    clubId: number;
    firstName: string;
    lastName: string;
    phone?: string;
    avatarUrl?: string;
    gender?: Gender;
  }) {
    return this.prisma.member.create({ data });
  }

  async update(
    clubId: number,
    id: number,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      gender?: Gender;
    },
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id, clubId },
    });
    if (!member) {
      throw new AppException('MEMBERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    return this.prisma.member.update({ where: { id }, data });
  }

  findByUserAndClub(userId: number, clubId: number) {
    return this.prisma.member.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
  }

  findById(id: number) {
    return this.prisma.member.findUnique({
      where: { id },
      include: { memberRoles: true },
    });
  }
}
