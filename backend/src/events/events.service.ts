import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateEventDto } from './dto/create-event.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

/**
 * CRUD des événements du calendrier (docs/schema/evenements.md — Event),
 * scopé équipe. L'URL porte toujours teamId (même pattern que TeamStaff),
 * donc pas besoin du contournement `?teamId=` utilisé par les ressources
 * scopées joueur (voir docs/modules/auth-roles.md §Patterns découverts).
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(clubId: number, teamId: number, dto: CreateEventDto) {
    await this.assertTeamInClub(clubId, teamId);

    return this.prisma.event.create({
      data: {
        teamId,
        type: dto.type,
        title: dto.title,
        startAt: dto.startAt,
        endAt: dto.endAt,
        location: dto.location,
        description: dto.description,
      },
    });
  }

  async findAllByTeam(
    clubId: number,
    teamId: number,
    query: FindEventsQueryDto = {},
  ) {
    await this.assertTeamInClub(clubId, teamId);

    return this.prisma.event.findMany({
      where: {
        teamId,
        type: query.type,
        startAt: { gte: query.dateFrom, lte: query.dateTo },
      },
      orderBy: { startAt: query.sortOrder ?? 'asc' },
    });
  }

  /**
   * "Mes événements" : agrège le calendrier de toutes les équipes
   * accessibles à l'appelant dans le club, condition préalable à toute vue
   * calendrier utilisable (docs/roadmap.md, étape B3). Contourne
   * volontairement PermissionsGuard, même pattern que
   * TeamsService.findMineInClub/PlayersService.findMe : cette route ne porte
   * pas de :teamId dans l'URL, donc un scope TEAM (Coach/Player) ne peut
   * jamais y matcher via le moteur RBAC générique (voir
   * docs/modules/auth-roles.md §Patterns découverts). Un scope CLUB/ALL
   * (AdminClub/SuperAdmin) voit tout le club ; sinon on retombe sur les
   * équipes où le membre a un MemberRole scopé équipe — visibles pour lui
   * par construction, sans consulter le système RBAC générique pour ce cas.
   */
  async findMineInClub(
    clubId: number,
    userId: number,
    query: FindEventsQueryDto = {},
  ) {
    const member = await this.membersService.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const clubWideScope = await this.permissionsService.can(
      member.id,
      'READ',
      'event',
      { clubId },
    );

    return this.prisma.event.findMany({
      where: {
        team: clubWideScope
          ? { clubId }
          : {
              clubId,
              memberRoles: {
                some: { memberId: member.id, teamId: { not: null } },
              },
            },
        type: query.type,
        startAt: { gte: query.dateFrom, lte: query.dateTo },
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { startAt: query.sortOrder ?? 'asc' },
    });
  }

  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateEventDto,
  ) {
    await this.findEventOrThrow(clubId, teamId, id);

    return this.prisma.event.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title,
        startAt: dto.startAt,
        endAt: dto.endAt,
        location: dto.location,
        description: dto.description,
      },
    });
  }

  async remove(clubId: number, teamId: number, id: number) {
    await this.findEventOrThrow(clubId, teamId, id);

    await this.prisma.event.delete({ where: { id } });
  }

  private async findEventOrThrow(clubId: number, teamId: number, id: number) {
    const event = await this.prisma.event.findFirst({
      where: { id, teamId, team: { clubId } },
    });
    if (!event) {
      throw new AppException('EVENTS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return event;
  }

  private async assertTeamInClub(clubId: number, teamId: number) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    });
    if (!team) {
      throw new AppException('EVENTS.TEAM_NOT_IN_CLUB', HttpStatus.BAD_REQUEST);
    }
  }
}
