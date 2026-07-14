import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertSeasonInClub } from '../common/season-club-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateChampionshipDto } from './dto/create-championship.dto';
import { FindChampionshipsQueryDto } from './dto/find-championships-query.dto';
import { UpdateChampionshipDto } from './dto/update-championship.dto';

const DEFAULT_POINTS_FOR_WIN = 3;
const DEFAULT_POINTS_FOR_DRAW = 1;
const DEFAULT_POINTS_FOR_LOSS = 0;
const DEFAULT_NUMBER_OF_PERIODS = 2;
const DEFAULT_PERIOD_DURATION_MINUTES = 45;

/**
 * CRUD des championnats (docs/schema/championnats.md — Championship), scopé
 * ÉQUIPE : `Championship.teamId` + `Championship.seasonId` (décision B4 —
 * Season est club-wide depuis A14, donc seasonId seul ne suffit plus à
 * identifier l'équipe ; aucune contrainte d'unicité entre les deux, une
 * équipe peut avoir plusieurs championnats sur une même saison). L'URL porte
 * toujours teamId (même pattern que EventsService/TeamStaffService) — pas de
 * contournement `?teamId=` nécessaire ici.
 */
@Injectable()
export class ChampionshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(clubId: number, teamId: number, dto: CreateChampionshipDto) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'CHAMPIONSHIPS.TEAM_NOT_IN_CLUB',
    );
    await assertSeasonInClub(
      this.prisma,
      clubId,
      dto.seasonId,
      'CHAMPIONSHIPS.SEASON_NOT_FOUND',
    );

    return this.prisma.championship.create({
      data: {
        seasonId: dto.seasonId,
        teamId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        pointsForWin: dto.pointsForWin ?? DEFAULT_POINTS_FOR_WIN,
        pointsForDraw: dto.pointsForDraw ?? DEFAULT_POINTS_FOR_DRAW,
        pointsForLoss: dto.pointsForLoss ?? DEFAULT_POINTS_FOR_LOSS,
        tiebreakerRules: dto.tiebreakerRules,
        tiebreakerPreset: dto.tiebreakerPreset,
        numberOfPeriods: dto.numberOfPeriods ?? DEFAULT_NUMBER_OF_PERIODS,
        periodDurationMinutes:
          dto.periodDurationMinutes ?? DEFAULT_PERIOD_DURATION_MINUTES,
      },
    });
  }

  async findAllByTeam(
    clubId: number,
    teamId: number,
    memberId: number,
    query: FindChampionshipsQueryDto = {},
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'CHAMPIONSHIPS.TEAM_NOT_IN_CLUB',
    );

    const [data, canManage] = await Promise.all([
      this.prisma.championship.findMany({
        where: { teamId, seasonId: query.seasonId },
        include: { season: { select: { id: true, name: true } } },
        orderBy: { startDate: 'desc' },
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  async findOne(clubId: number, teamId: number, id: number, memberId: number) {
    const [championship, canManage] = await Promise.all([
      this.findChampionshipOrThrow(clubId, teamId, id),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { ...championship, canManage };
  }

  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateChampionshipDto,
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, id);
    if (dto.seasonId) {
      await assertSeasonInClub(
        this.prisma,
        clubId,
        dto.seasonId,
        'CHAMPIONSHIPS.SEASON_NOT_FOUND',
      );
    }

    return this.prisma.championship.update({
      where: { id },
      data: {
        seasonId: dto.seasonId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        pointsForWin: dto.pointsForWin,
        pointsForDraw: dto.pointsForDraw,
        pointsForLoss: dto.pointsForLoss,
        tiebreakerRules: dto.tiebreakerRules,
        tiebreakerPreset: dto.tiebreakerPreset,
        numberOfPeriods: dto.numberOfPeriods,
        periodDurationMinutes: dto.periodDurationMinutes,
      },
    });
  }

  async remove(clubId: number, teamId: number, id: number) {
    await this.findChampionshipOrThrow(clubId, teamId, id);
    await this.prisma.championship.delete({ where: { id } });
  }

  private async findChampionshipOrThrow(
    clubId: number,
    teamId: number,
    id: number,
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'CHAMPIONSHIPS.TEAM_NOT_IN_CLUB',
    );
    const championship = await this.prisma.championship.findFirst({
      where: { id, teamId },
      include: { season: { select: { id: true, name: true } } },
    });
    if (!championship) {
      throw new AppException('CHAMPIONSHIPS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return championship;
  }

  // `canManage` reflète la capacité d'écriture réelle (boutons Créer/
  // Modifier/Supprimer) — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). Player n'a que `championship READ` scope TEAM (voir
  // backend/prisma/seed.ts B0), contrairement à Coach/AdminClub+.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'championship',
      { clubId, teamId },
    );
    return !!scope;
  }
}
