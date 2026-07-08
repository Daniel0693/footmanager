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
    birthDate?: Date;
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
      birthDate?: Date;
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

  /**
   * "Mon profil" (docs/roadmap.md) : accès à ses propres données par
   * construction (le Member est résolu depuis le JWT via userId+clubId),
   * donc pas de scope RBAC à évaluer ici. Contourne volontairement
   * PermissionsGuard — même raison que PlayersService.findMe : un Coach/
   * Player a un MemberRole scopé équipe, ce qui empêcherait toute
   * correspondance de scope sur une route sans teamId dans l'URL.
   */
  async findMe(clubId: number, userId: number) {
    const member = await this.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return member;
  }

  async updateMe(clubId: number, userId: number, data: { birthDate?: Date }) {
    const member = await this.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return this.prisma.member.update({ where: { id: member.id }, data });
  }

  findById(id: number) {
    return this.prisma.member.findUnique({
      where: { id },
      include: { memberRoles: true },
    });
  }
}
