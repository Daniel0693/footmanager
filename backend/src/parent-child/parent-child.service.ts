import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { CreateParentChildDto } from './dto/create-parent-child.dto';

export interface ParentChildRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Lien Parent ↔ Joueur (docs/decisions-ouvertes-et-rgpd.md #5, tranché — voir
 * docs/modules/auth-roles.md §Rôle Parent). Créé/supprimé uniquement par le
 * staff (Coach/AdminClub/SuperAdmin) : jamais par le Parent lui-même, donnée
 * sensible sur un mineur, pas une auto-déclaration.
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * parent_child/ACTION dans ce club ?" — pas que le joueur ciblé par l'URL
 * appartient bien à l'équipe transmise en query. Pour le scope TEAM (Coach),
 * ce service vérifie l'appartenance via `assertPlayerInTeam` (même pattern
 * que les autres ressources scopées joueur).
 */
@Injectable()
export class ParentChildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
  ) {}

  async create(
    clubId: number,
    playerId: number,
    dto: CreateParentChildDto,
    requester: ParentChildRequestContext,
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PARENT_CHILD.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const parentMember = await this.prisma.member.findFirst({
      where: { id: dto.parentMemberId, clubId },
    });
    if (!parentMember) {
      throw new AppException(
        'PARENT_CHILD.PARENT_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (parentMember.id === player.memberId) {
      throw new AppException(
        'PARENT_CHILD.CANNOT_LINK_SELF',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.prisma.parentChild.findUnique({
      where: {
        parentMemberId_childMemberId: {
          parentMemberId: parentMember.id,
          childMemberId: player.memberId,
        },
      },
    });
    if (existing) {
      throw new AppException(
        'PARENT_CHILD.ALREADY_LINKED',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.parentChild.create({
      data: { parentMemberId: parentMember.id, childMemberId: player.memberId },
      include: { parentMember: true },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: ParentChildRequestContext,
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PARENT_CHILD.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.parentChild.findMany({
      where: { childMemberId: player.memberId },
      include: { parentMember: true },
      orderBy: { id: 'asc' },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: ParentChildRequestContext,
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PARENT_CHILD.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const link = await this.prisma.parentChild.findFirst({
      where: { id, childMemberId: player.memberId },
    });
    if (!link) {
      throw new AppException('PARENT_CHILD.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    await this.prisma.parentChild.delete({ where: { id } });
  }

  /**
   * "Mes enfants" : résolution d'identité pure depuis le JWT (pattern
   * self-service /mine, docs/modules/auth-roles.md §Patterns découverts) —
   * contourne volontairement PermissionsGuard, pas de scope RBAC à évaluer.
   */
  async findMineInClub(clubId: number, userId: number) {
    const member = await this.membersService.resolveOrProvisionMember(
      userId,
      clubId,
    );

    return this.prisma.parentChild.findMany({
      where: { parentMemberId: member.id },
      include: {
        childMember: { include: { playerProfile: true } },
      },
      orderBy: { id: 'asc' },
    });
  }
}
