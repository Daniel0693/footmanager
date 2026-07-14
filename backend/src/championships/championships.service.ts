import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertSeasonInClub } from '../common/season-club-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { computeStandings } from './standings/compute-standings';
import type { TiebreakerRule } from './tiebreaker-rule';
import { CreateChampionshipDto } from './dto/create-championship.dto';
import { FindChampionshipsQueryDto } from './dto/find-championships-query.dto';
import { UpdateChampionshipDto } from './dto/update-championship.dto';

const PARTICIPANT_SELECT = {
  id: true,
  internalTeam: { select: { id: true, name: true } },
  externalTeam: { select: { id: true, name: true } },
} as const;

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

  // Vue transverse "tous les championnats d'une saison, toutes équipes
  // confondues" — consommée par la fiche de saison (docs/roadmap.md B16),
  // surtout utile à l'AdminClub. Pas de `?teamId=` ici : contrairement aux
  // routes scopées équipe ci-dessus, cet endpoint ne porte que sur
  // `championship READ`, résolu sans teamId — seul un scope CLUB/ALL
  // (AdminClub+) le satisfait, un Coach/Player (scope TEAM) reçoit 403 par
  // construction (aucun contournement `?teamId=` prévu, cette vue
  // cross-équipe n'a pas de sens pour un rôle limité à sa propre équipe).
  async findAllBySeason(clubId: number, seasonId: number) {
    await assertSeasonInClub(
      this.prisma,
      clubId,
      seasonId,
      'CHAMPIONSHIPS.SEASON_NOT_FOUND',
    );
    return this.prisma.championship.findMany({
      where: { seasonId },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
    });
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

  // Calcule le classement à la volée (compute-standings.ts, fonction pure,
  // B12) depuis les ChampionshipMatch FINISHED — jamais persisté (pas de
  // table Standing en MVP, docs/modules/saisons-championnats.md §Classement).
  async getStandings(clubId: number, teamId: number, id: number) {
    const championship = await this.findChampionshipOrThrow(clubId, teamId, id);

    const [participants, matches] = await Promise.all([
      this.prisma.championshipParticipant.findMany({
        where: { championshipId: id },
        select: PARTICIPANT_SELECT,
      }),
      this.prisma.championshipMatch.findMany({
        where: { championshipId: id, status: 'FINISHED' },
        select: {
          homeParticipantId: true,
          awayParticipantId: true,
          scoreHome: true,
          scoreAway: true,
        },
      }),
    ]);

    const rows = computeStandings({
      participantIds: participants.map((p) => p.id),
      // status FINISHED garantit scoreHome/scoreAway non-null (voir
      // ChampionshipMatchesService.update), le `!` reflète cette invariante.
      matches: matches.map((m) => ({
        homeParticipantId: m.homeParticipantId,
        awayParticipantId: m.awayParticipantId,
        scoreHome: m.scoreHome!,
        scoreAway: m.scoreAway!,
      })),
      pointsForWin: championship.pointsForWin,
      pointsForDraw: championship.pointsForDraw,
      pointsForLoss: championship.pointsForLoss,
      tiebreakerRules: championship.tiebreakerRules as TiebreakerRule[],
    });

    const participantById = new Map(participants.map((p) => [p.id, p]));
    return rows.map((row) => ({
      ...row,
      participant: participantById.get(row.participantId) ?? null,
    }));
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
