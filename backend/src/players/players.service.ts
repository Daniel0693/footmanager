import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerProfileDto } from './dto/create-player-profile.dto';
import { UpdatePlayerProfileDto } from './dto/update-player-profile.dto';

export interface PlayerRequestContext {
  memberId: number;
  scope: PermissionScope;
}

/**
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_profile/ACTION dans ce club ?" — pas que la ressource ciblée est
 * bien la sienne. Pour le scope OWN, c'est ce service qui compare le
 * `memberId` du profil visé à celui de l'appelant (docs/modules/auth-roles.md
 * — le filtrage fin reste la responsabilité du service).
 */
@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
  ) {}

  /**
   * "Mon" profil joueur : accès à ses propres données par construction (le
   * Member est résolu depuis le JWT via userId+clubId), donc pas de scope
   * RBAC à évaluer ici. Contourne volontairement PermissionsGuard — un
   * Player a un MemberRole scopé par équipe (docs/schema/fondations.md),
   * ce qui empêcherait toute correspondance de scope OWN sur une route sans
   * teamId dans l'URL. Voir décision du 2026-07-03 (étape A2).
   */
  async findMe(clubId: number, userId: number) {
    const member = await this.membersService.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { memberId: member.id },
    });
    if (!profile) {
      throw new AppException('PLAYERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return profile;
  }

  async create(clubId: number, dto: CreatePlayerProfileDto) {
    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
    });
    if (!member || member.clubId !== clubId) {
      throw new AppException(
        'PLAYERS.MEMBER_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.prisma.playerProfile.findUnique({
      where: { memberId: dto.memberId },
    });
    if (existing) {
      throw new AppException(
        'PLAYERS.PROFILE_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.playerProfile.create({
      data: {
        memberId: dto.memberId,
        licenseNumber: dto.licenseNumber,
        nationality: dto.nationality,
        birthDate: dto.birthDate,
      },
    });
  }

  async findAllByClub(clubId: number, requester: PlayerRequestContext) {
    if (requester.scope === 'OWN') {
      const own = await this.prisma.playerProfile.findFirst({
        where: { memberId: requester.memberId, member: { clubId } },
      });
      return own ? [own] : [];
    }

    return this.prisma.playerProfile.findMany({
      where: { member: { clubId } },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(clubId: number, id: number, requester: PlayerRequestContext) {
    const profile = await this.prisma.playerProfile.findFirst({
      where: { id, member: { clubId } },
    });
    if (!profile) {
      throw new AppException('PLAYERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (requester.scope === 'OWN' && profile.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return profile;
  }

  async update(clubId: number, id: number, dto: UpdatePlayerProfileDto) {
    const profile = await this.prisma.playerProfile.findFirst({
      where: { id, member: { clubId } },
    });
    if (!profile) {
      throw new AppException('PLAYERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    return this.prisma.playerProfile.update({
      where: { id },
      data: {
        licenseNumber: dto.licenseNumber,
        nationality: dto.nationality,
        birthDate: dto.birthDate,
      },
    });
  }

  async remove(clubId: number, id: number) {
    const profile = await this.prisma.playerProfile.findFirst({
      where: { id, member: { clubId } },
    });
    if (!profile) {
      throw new AppException('PLAYERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    await this.prisma.playerProfile.delete({ where: { id } });
  }
}
