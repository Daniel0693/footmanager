import { HttpStatus, Injectable } from '@nestjs/common';
import type { PlayerTeam, Season } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from './seasons.service';

export interface ActivationPlayerSummary {
  playerId: number;
  firstName: string;
  lastName: string;
}

export interface SeasonActivationSummary {
  retained: ActivationPlayerSummary[];
  departing: ActivationPlayerSummary[];
  arriving: ActivationPlayerSummary[];
  // Valeur pré-remplie côté frontend pour le champ `oldSeasonEndDate` du
  // formulaire de validation — null si pas d'ancienne saison ACTIVE
  // (première saison de l'équipe, voir activate() ci-dessous).
  oldSeasonEndDate: Date | null;
}

type AssignmentWithMember = PlayerTeam & {
  player: { member: { firstName: string; lastName: string } };
};

/**
 * Étape 4 du wizard de saison (docs/modules/saisons-championnats.md) —
 * service dédié, même principe que SeasonRosterImportService (A6) : logique
 * distincte qui aurait fait grossir inutilement le CRUD de base de Season.
 */
@Injectable()
export class SeasonActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasonsService: SeasonsService,
  ) {}

  async getActivationSummary(
    clubId: number,
    teamId: number,
    seasonId: number,
  ): Promise<SeasonActivationSummary> {
    const newSeason = await this.assertSeasonIsDraft(clubId, teamId, seasonId);
    const oldSeason = await this.findActiveSeason(teamId);
    const groups = await this.groupActiveAssignments(
      teamId,
      newSeason.startDate,
    );

    return { ...groups, oldSeasonEndDate: oldSeason?.endDate ?? null };
  }

  /**
   * À la validation (docs/modules/saisons-championnats.md, étape 4) :
   * 1. L'ancienne saison ACTIVE (s'il y en a une) passe en ARCHIVED, avec
   *    l'endDate éventuellement corrigée par l'utilisateur.
   * 2. Les PlayerTeam actives dont le joinDate précède le début de la
   *    nouvelle saison reçoivent ce même leaveDate — couvre uniformément
   *    les partants et l'ancienne affectation (doublonnée) des joueurs
   *    reconduits (voir SeasonRosterImportService, A6).
   * 3. La nouvelle saison passe en ACTIVE.
   *
   * Pas d'ancienne saison ACTIVE (première saison de l'équipe) : saute
   * entièrement l'étape 1-2, active directement la nouvelle saison.
   */
  async activate(
    clubId: number,
    teamId: number,
    seasonId: number,
    oldSeasonEndDateOverride?: Date,
  ): Promise<Season> {
    const newSeason = await this.assertSeasonIsDraft(clubId, teamId, seasonId);
    const oldSeason = await this.findActiveSeason(teamId);

    await this.prisma.$transaction(async (tx) => {
      if (oldSeason) {
        const finalEndDate = oldSeasonEndDateOverride ?? oldSeason.endDate;
        await tx.season.update({
          where: { id: oldSeason.id },
          data: { status: 'ARCHIVED', endDate: finalEndDate },
        });
        await tx.playerTeam.updateMany({
          where: {
            teamId,
            leaveDate: null,
            joinDate: { lt: newSeason.startDate },
          },
          data: { leaveDate: finalEndDate },
        });
      }

      await tx.season.update({
        where: { id: newSeason.id },
        data: { status: 'ACTIVE' },
      });
    });

    // Assertion défensive (docs/modules/saisons-championnats.md) : l'opération
    // ci-dessus est atomique et garantit ce résultat par construction — un
    // écart ici signalerait une incohérence de données préexistante, pas un
    // bug de cette méthode.
    const activeCount = await this.prisma.season.count({
      where: { teamId, status: 'ACTIVE' },
    });
    if (activeCount !== 1) {
      throw new AppException(
        'SEASONS.MULTIPLE_ACTIVE_SEASONS',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.season.findUniqueOrThrow({
      where: { id: newSeason.id },
    });
  }

  private findActiveSeason(teamId: number) {
    return this.prisma.season.findFirst({
      where: { teamId, status: 'ACTIVE' },
    });
  }

  /**
   * Regroupe les affectations PlayerTeam actives par joueur pour déduire
   * reconduits/partants/arrivants (docs/modules/saisons-championnats.md) :
   * - Reconduit : une affectation antérieure à la nouvelle saison ET une
   *   affectation à partir de son startDate (créée par l'import, A6).
   * - Partant : uniquement une affectation antérieure — jamais reconduite.
   * - Arrivant : uniquement une affectation à partir du startDate — ajout
   *   manuel pendant la fenêtre DRAFT (docs/modules/saisons-championnats.md,
   *   "arrivées / transferts").
   * `joinDate` null (rare) : ni "avant" ni "après", classé arrivant par
   * défaut — jamais fermé par activate() (le filtre `lt` exclut NULL).
   */
  private async groupActiveAssignments(
    teamId: number,
    newSeasonStartDate: Date,
  ) {
    const assignments = (await this.prisma.playerTeam.findMany({
      where: { teamId, leaveDate: null },
      include: { player: { include: { member: true } } },
    })) as AssignmentWithMember[];

    const byPlayer = new Map<number, AssignmentWithMember[]>();
    for (const assignment of assignments) {
      const list = byPlayer.get(assignment.playerId) ?? [];
      list.push(assignment);
      byPlayer.set(assignment.playerId, list);
    }

    const retained: ActivationPlayerSummary[] = [];
    const departing: ActivationPlayerSummary[] = [];
    const arriving: ActivationPlayerSummary[] = [];

    for (const playerAssignments of byPlayer.values()) {
      const hasOld = playerAssignments.some(
        (a) => a.joinDate !== null && a.joinDate < newSeasonStartDate,
      );
      const hasNew = playerAssignments.some(
        (a) => a.joinDate !== null && a.joinDate >= newSeasonStartDate,
      );
      const first = playerAssignments[0];
      const summary: ActivationPlayerSummary = {
        playerId: first.playerId,
        firstName: first.player.member.firstName,
        lastName: first.player.member.lastName,
      };

      if (hasOld && hasNew) retained.push(summary);
      else if (hasOld) departing.push(summary);
      else arriving.push(summary);
    }

    return { retained, departing, arriving };
  }

  private async assertSeasonIsDraft(
    clubId: number,
    teamId: number,
    seasonId: number,
  ) {
    const season = await this.seasonsService.findOne(clubId, teamId, seasonId);
    if (season.status !== 'DRAFT') {
      throw new AppException(
        'SEASONS.ACTIVATION_ONLY_FOR_DRAFT',
        HttpStatus.CONFLICT,
      );
    }
    return season;
  }
}
