import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  create(data: { clubId: number; name: string }) {
    return this.prisma.team.create({ data });
  }

  findById(id: number) {
    return this.prisma.team.findUnique({ where: { id } });
  }

  async findByIdInClub(clubId: number, id: number) {
    const team = await this.prisma.team.findFirst({ where: { id, clubId } });
    if (!team) {
      throw new AppException('TEAMS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return team;
  }

  findAllByClub(clubId: number) {
    return this.prisma.team.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * "Mes équipes" : contourne volontairement PermissionsGuard. Un rôle
   * scopé TEAM (Coach) ne peut jamais faire correspondre son MemberRole via
   * le guard générique sur cette route — elle liste justement les équipes,
   * donc ne porte pas de :teamId dans l'URL (même limite structurelle que
   * /players/me, voir PlayersService.findMe). Ici on distingue nous-mêmes :
   * un scope club-wide (CLUB/ALL, MemberRole.teamId=null) voit tout le
   * club ; sinon, on retombe sur les équipes où le membre a un MemberRole
   * scopé équipe — visible pour lui par construction, sans consulter le
   * système RBAC générique.
   */
  async findMineInClub(clubId: number, userId: number) {
    const member = await this.membersService.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const clubWideScope = await this.permissionsService.can(
      member.id,
      'READ',
      'team',
      { clubId },
    );
    if (clubWideScope) {
      return this.findAllByClub(clubId);
    }

    return this.prisma.team.findMany({
      where: {
        clubId,
        memberRoles: { some: { memberId: member.id, teamId: { not: null } } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
