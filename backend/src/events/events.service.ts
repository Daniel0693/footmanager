import { HttpStatus, Injectable } from '@nestjs/common';
import type { EventType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

  /**
   * Création en masse pour un événement récurrent (docs/roadmap.md) : le
   * frontend a déjà résolu la règle de récurrence en dates concrètes
   * (lib/recurrence.ts) — chaque occurrence est créée ici comme un Event
   * indépendant, `isRecurring = true`, sans lien de groupe entre elles
   * (pas de RecurringRule, décision documentée dans docs/schema/evenements.md).
   * `createMany` : une seule requête, pas de retour des lignes créées —
   * suffisant puisque l'appelant recharge la vue calendrier après succès.
   */
  async createBulk(clubId: number, teamId: number, dtos: CreateEventDto[]) {
    await this.assertTeamInClub(clubId, teamId);

    // Un seul identifiant pour tout le lot : permet de retrouver "cet
    // événement et les suivants" plus tard (update/remove en scope=future,
    // voir docs/schema/evenements.md §Événements récurrents).
    const recurringGroupId = randomUUID();

    await this.prisma.event.createMany({
      data: dtos.map((dto) => ({
        teamId,
        type: dto.type,
        title: dto.title,
        startAt: dto.startAt,
        endAt: dto.endAt,
        location: dto.location,
        description: dto.description,
        isRecurring: true,
        recurringGroupId,
      })),
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
   *
   * `types`/`teamIds` (pluriels, tableaux) alimentent les cases à cocher de
   * la barre latérale du calendrier (docs/modules/calendrier-evenements.md
   * §Filtres) — distinct du `type` singulier de FindEventsQueryDto utilisé
   * par le CRUD scopé équipe (findAllByTeam), résolu côté backend comme le
   * reste du filtrage/tri de l'application.
   */
  async findMineInClub(
    clubId: number,
    userId: number,
    filters: {
      types?: EventType[];
      teamIds?: number[];
      dateFrom?: Date;
      dateTo?: Date;
      sortOrder?: 'asc' | 'desc';
    } = {},
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

    const accessibleTeams = clubWideScope
      ? { clubId }
      : {
          clubId,
          memberRoles: {
            some: { memberId: member.id, teamId: { not: null } },
          },
        };

    return this.prisma.event.findMany({
      where: {
        team: filters.teamIds?.length
          ? { ...accessibleTeams, id: { in: filters.teamIds } }
          : accessibleTeams,
        type: filters.types?.length ? { in: filters.types } : undefined,
        startAt: { gte: filters.dateFrom, lte: filters.dateTo },
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { startAt: filters.sortOrder ?? 'asc' },
    });
  }

  /**
   * `scope: 'future'` (docs/schema/evenements.md §Événements récurrents) :
   * ne s'applique que si l'événement appartient à un lot récurrent
   * (`recurringGroupId` non null) — sinon retombe silencieusement sur le
   * comportement `single`, un événement isolé n'a pas de "suivants". Seuls
   * titre/type/lieu/description/heure (extraite de `dto.startAt`/`endAt`)
   * se propagent aux occurrences trouvées ; la date de chacune est
   * préservée (`combineDateWithTime`), jamais écrasée par la date soumise
   * pour l'occurrence éditée.
   */
  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateEventDto,
    scope: 'single' | 'future' = 'single',
  ) {
    const anchor = await this.findEventOrThrow(clubId, teamId, id);

    if (scope === 'future' && anchor.recurringGroupId) {
      const occurrences = await this.prisma.event.findMany({
        where: {
          teamId,
          recurringGroupId: anchor.recurringGroupId,
          startAt: { gte: anchor.startAt },
        },
      });

      await this.prisma.$transaction(
        occurrences.map((occurrence) =>
          this.prisma.event.update({
            where: { id: occurrence.id },
            data: {
              type: dto.type,
              title: dto.title,
              startAt: dto.startAt
                ? combineDateWithTime(occurrence.startAt, dto.startAt)
                : undefined,
              endAt: dto.endAt
                ? combineDateWithTime(occurrence.startAt, dto.endAt)
                : dto.endAt,
              location: dto.location,
              description: dto.description,
            },
          }),
        ),
      );
      return { count: occurrences.length };
    }

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

  async remove(
    clubId: number,
    teamId: number,
    id: number,
    scope: 'single' | 'future' = 'single',
  ) {
    const anchor = await this.findEventOrThrow(clubId, teamId, id);

    if (scope === 'future' && anchor.recurringGroupId) {
      await this.prisma.event.deleteMany({
        where: {
          teamId,
          recurringGroupId: anchor.recurringGroupId,
          startAt: { gte: anchor.startAt },
        },
      });
      return;
    }

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

// Conserve la date (année/mois/jour) de `date`, applique l'heure de `time` —
// utilisé par update() en scope=future pour ne propager que l'heure aux
// occurrences suivantes, jamais la date de l'occurrence éditée.
function combineDateWithTime(date: Date, time: Date): Date {
  const result = new Date(date);
  result.setHours(
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    time.getMilliseconds(),
  );
  return result;
}
