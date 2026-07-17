import { HttpStatus, Injectable } from '@nestjs/common';
import type { LiveMatchStatus } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';

const INACTIVE_STATUSES: LiveMatchStatus[] = [
  'FINISHED',
  'CANCELLED',
  'POSTPONED',
];

/**
 * Gestion des périodes d'un match en live (docs/schema/evenements.md
 * §MatchPeriod, docs/modules/matchs.md §Lancement et gestion des périodes,
 * Phase 4 Partie C, C1), scopée ÉQUIPE via
 * `clubs/:clubId/teams/:teamId/matches/:matchId/periods`.
 *
 * `startedAt`/`endedAt` sont TOUJOURS des timestamps serveur (`new Date()`
 * ici), jamais acceptés depuis le client — la minute affichée en live est
 * recalculée côté frontend depuis `startedAt`, jamais stockée.
 *
 * Terminer une période fait toujours passer `Match.status` à `HALFTIME`,
 * y compris pour la DERNIÈRE période configurée : la transition vers
 * `FINISHED` (+ calcul du score) est un geste explicite et distinct
 * ("Clore le match", Partie C, C3), pas un effet de bord automatique de la
 * fin de la dernière période — permet à l'entraîneur de revoir/corriger
 * avant clôture définitive.
 *
 * Pas de plafond serveur sur le nombre de périodes démarrables (ex.
 * `Match.numberOfPeriods` résolu) : `numberOfPeriods` n'est aujourd'hui
 * renseigné nulle part côté frontend pour un match créé directement (aucun
 * champ dédié, contrairement à `gameFormat` depuis B10 — voir
 * `docs/modules/matchs.md` §Périodes de jeu), donc une telle résolution
 * serait incomplète. MVP : un seul utilisateur gère le live (docs/modules/
 * matchs.md), le frontend (C4) masque simplement "Lancer la période
 * suivante" une fois le nombre configuré atteint — pas une garde serveur
 * dure pour l'instant.
 */
@Injectable()
export class MatchPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async startNext(clubId: number, teamId: number, matchId: number) {
    const match = await this.findMatchOrThrow(clubId, teamId, matchId);
    this.assertMatchActive(match.status);

    const openPeriod = await this.prisma.matchPeriod.findFirst({
      where: { matchId, endedAt: null },
    });
    if (openPeriod) {
      throw new AppException('MATCH_PERIODS.ALREADY_OPEN', HttpStatus.CONFLICT);
    }

    const lastPeriod = await this.prisma.matchPeriod.findFirst({
      where: { matchId },
      orderBy: { periodNumber: 'desc' },
    });
    const periodNumber = (lastPeriod?.periodNumber ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.matchPeriod.create({
        data: { matchId, periodNumber, startedAt: new Date() },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'LIVE' },
      });
      return period;
    });
  }

  async endCurrent(
    clubId: number,
    teamId: number,
    matchId: number,
    id: number,
  ) {
    const match = await this.findMatchOrThrow(clubId, teamId, matchId);
    this.assertMatchActive(match.status);

    const period = await this.prisma.matchPeriod.findFirst({
      where: { id, matchId },
    });
    if (!period) {
      throw new AppException('MATCH_PERIODS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (period.endedAt) {
      throw new AppException(
        'MATCH_PERIODS.ALREADY_ENDED',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.matchPeriod.update({
        where: { id },
        data: { endedAt: new Date() },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'HALFTIME' },
      });
      return ended;
    });
  }

  async findAllByMatch(
    clubId: number,
    teamId: number,
    matchId: number,
    memberId: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    const [data, canManage] = await Promise.all([
      this.prisma.matchPeriod.findMany({
        where: { matchId },
        orderBy: { periodNumber: 'asc' },
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  // `canManage` reflète la capacité de gérer le live (bouton "Lancer/Fin de
  // période") — jamais déduit d'un rôle côté client (règle CLAUDE.md).
  // AdminClub n'a que READ sur match_period (docs/modules/matchs.md §Droits
  // par rôle), donc toujours canManage=false pour lui.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'match_period',
      { clubId, teamId },
    );
    return !!scope;
  }

  private assertMatchActive(status: LiveMatchStatus) {
    if (INACTIVE_STATUSES.includes(status)) {
      throw new AppException(
        'MATCH_PERIODS.MATCH_NOT_ACTIVE',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async findMatchOrThrow(
    clubId: number,
    teamId: number,
    matchId: number,
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'MATCH_PERIODS.TEAM_NOT_IN_CLUB',
    );
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, event: { teamId } },
    });
    if (!match) {
      throw new AppException(
        'MATCH_PERIODS.MATCH_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return match;
  }
}
