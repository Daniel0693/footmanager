import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
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

  // Crée le championnat ET son premier participant (l'équipe propriétaire,
  // `teamId` de l'URL) dans la même transaction — retour utilisateur (B19) :
  // il fallait auparavant l'ajouter manuellement ensuite via "Ajouter notre
  // équipe" (ParticipantsTab). Toujours l'équipe de l'URL, jamais déduite
  // d'un choix utilisateur ici — le sélecteur club/équipe éventuel (Coach vs
  // AdminClub vs SuperAdmin/Proprietaire, B19) est résolu côté frontend
  // avant l'appel : cette méthode reste agnostique du rôle appelant, elle
  // fait toujours confiance à `teamId`.
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

    return this.prisma.$transaction(async (tx) => {
      const championship = await tx.championship.create({
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
          // Pas de constante DEFAULT_GAME_FORMAT ici : `undefined` laisse
          // Prisma appliquer le défaut déclaré au schéma (@default(ELEVEN)),
          // contrairement aux autres champs ci-dessus qui n'ont pas de
          // défaut Prisma natif.
          gameFormat: dto.gameFormat,
        },
      });
      await tx.championshipParticipant.create({
        data: { championshipId: championship.id, internalTeamId: teamId },
      });
      return championship;
    });
  }

  // `createScope` (scope brut — TEAM/CLUB/ALL/null) accompagne `canManage`
  // (B19) : le frontend en a besoin pour choisir la variante du formulaire
  // de création (Coach : aucun sélecteur, son équipe automatiquement ;
  // AdminClub : sélecteur d'équipe parmi celles du club ; SuperAdmin/
  // Proprietaire : sélecteur de club puis d'équipe) — `canManage` seul
  // (booléen) ne permet pas de distinguer ces trois cas. `readScope` (B20)
  // pilote de la même façon la LISTE elle-même : TEAM garde la vue scopée
  // équipe actuelle (inchangée) ; CLUB/ALL fait pivoter le frontend vers
  // `findAllByClub` (colonne Équipe, éventuellement précédée d'un sélecteur
  // de club pour ALL) — distinct de `createScope` par principe (une future
  // permission en lecture seule pourrait un jour avoir un scope différent
  // de la permission d'écriture), même si les deux coïncident dans le seed
  // actuel.
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

    const [data, createScope, readScope] = await Promise.all([
      this.prisma.championship.findMany({
        where: { teamId, seasonId: query.seasonId },
        include: { season: { select: { id: true, name: true } } },
        orderBy: { startDate: 'desc' },
      }),
      this.permissionsService.can(memberId, 'CREATE', 'championship', {
        clubId,
        teamId,
      }),
      this.permissionsService.can(memberId, 'READ', 'championship', {
        clubId,
        teamId,
      }),
    ]);
    return { data, canManage: !!createScope, createScope, readScope };
  }

  // Vue transverse "tous les championnats d'une saison, toutes équipes
  // confondues" — consommée par la fiche de saison (docs/roadmap.md B16),
  // surtout utile à l'AdminClub. Route sans `:teamId`, mais `PermissionsGuard`
  // résout `clubId`/`teamId` depuis params **OU body OU query** quel que soit
  // ce que déclare le contrôleur (docs/modules/auth-roles.md §"Patterns
  // découverts") : un Coach (scope TEAM) qui transmet `?teamId=<sa propre
  // équipe>` passerait donc le guard. **`requester` reste la seule protection
  // réelle** — filtre explicitement sur `requester.teamId` dès que le scope
  // résolu est TEAM (faille corrigée en B20, présente depuis B16 : un Coach
  // pouvait sinon voir les championnats de TOUTES les équipes du club pour
  // cette saison, pas seulement la sienne).
  async findAllBySeason(
    clubId: number,
    seasonId: number,
    requester: { scope: PermissionScope; teamId?: number },
  ) {
    await assertSeasonInClub(
      this.prisma,
      clubId,
      seasonId,
      'CHAMPIONSHIPS.SEASON_NOT_FOUND',
    );
    return this.prisma.championship.findMany({
      where: {
        seasonId,
        teamId: requester.scope === 'TEAM' ? requester.teamId : undefined,
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  // Vue transverse "tous les championnats du club, toutes équipes
  // confondues" — retour utilisateur (B20) : l'AdminClub veut voir en un
  // coup d'œil à quelle équipe appartient chaque championnat (colonne
  // Équipe côté frontend) sans changer d'équipe de contexte ; le
  // SuperAdmin/Proprietaire choisit d'abord un club (parmi ceux où il a une
  // fiche Member — limite multi-club documentée), puis obtient la même vue.
  // Même garde-fou que `findAllBySeason` ci-dessus : `requester.teamId`
  // filtre les résultats dès que le scope résolu est TEAM, le guard seul ne
  // suffisant pas à borner la vue à une seule équipe.
  async findAllByClub(
    clubId: number,
    memberId: number,
    requester: { scope: PermissionScope; teamId?: number },
  ) {
    const [data, createScope] = await Promise.all([
      this.prisma.championship.findMany({
        where: {
          team: { clubId },
          teamId: requester.scope === 'TEAM' ? requester.teamId : undefined,
        },
        include: {
          season: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.permissionsService.can(memberId, 'CREATE', 'championship', {
        clubId,
        teamId: requester.teamId,
      }),
    ]);
    return { data, canManage: !!createScope, createScope };
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
        gameFormat: dto.gameFormat,
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
