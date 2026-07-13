import { HttpStatus, Injectable } from '@nestjs/common';
import type { Position } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from './seasons.service';

export interface RosterImportCandidate {
  playerId: number;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  mainPosition: Position | null;
}

/**
 * Étape 2 du wizard de saison (docs/modules/saisons-championnats.md) —
 * service dédié plutôt qu'ajout à SeasonsService : logique distincte
 * (lecture/écriture PlayerTeam) qui aurait fait grossir inutilement le CRUD
 * de base de Season.
 */
@Injectable()
export class SeasonRosterImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasonsService: SeasonsService,
  ) {}

  /**
   * Roster actif ACTUEL de l'équipe — indépendant de la saison ciblée :
   * `PlayerTeam` n'a pas de FK directe vers `Season` (docs/schema/
   * championnats.md), l'appartenance à une saison se déduit des dates. L'id
   * de saison ne sert ici qu'à vérifier l'appartenance club/équipe et que la
   * saison est bien en DRAFT (étape du wizard non pertinente autrement).
   */
  async previewRoster(
    clubId: number,
    teamId: number,
    seasonId: number,
  ): Promise<RosterImportCandidate[]> {
    await this.assertSeasonIsDraft(clubId, teamId, seasonId);

    const assignments = await this.prisma.playerTeam.findMany({
      where: { teamId, leaveDate: null },
      include: { player: { include: { member: true } } },
      orderBy: { player: { member: { lastName: 'asc' } } },
    });

    return assignments.map((assignment) => ({
      playerId: assignment.playerId,
      firstName: assignment.player.member.firstName,
      lastName: assignment.player.member.lastName,
      jerseyNumber: assignment.jerseyNumber,
      mainPosition: assignment.mainPosition,
    }));
  }

  /**
   * Crée une nouvelle affectation `PlayerTeam` par joueur reconduit
   * (`joinDate = season.startDate`), en reportant numéro de maillot et poste
   * de son affectation active actuelle (continuité — évite au coach de tout
   * ressaisir pour chaque joueur reconduit).
   *
   * Ne pose AUCUN `leaveDate` ici — ni sur l'ancienne affectation des
   * joueurs reconduits, ni sur celle des partants : réservé à l'activation
   * (`SeasonsService.activate`, A9) pour que le wizard reste annulable sans
   * effet de bord tant qu'il n'est pas validé (clarifié le 2026-07-13, voir
   * docs/modules/saisons-championnats.md).
   *
   * Effet de bord documenté et volontaire : entre l'import (ici) et
   * l'activation, un joueur reconduit a temporairement DEUX affectations
   * `PlayerTeam` actives sur la même équipe (l'ancienne, pas encore close,
   * et la nouvelle) — visible si l'on consulte l'effectif pendant cette
   * fenêtre. Limite acceptée du wizard en l'état.
   */
  async importRoster(
    clubId: number,
    teamId: number,
    seasonId: number,
    retainedPlayerIds: number[],
  ): Promise<{ importedCount: number }> {
    const season = await this.assertSeasonIsDraft(clubId, teamId, seasonId);

    if (retainedPlayerIds.length === 0) {
      return { importedCount: 0 };
    }

    const currentAssignments = await this.prisma.playerTeam.findMany({
      where: { teamId, leaveDate: null, playerId: { in: retainedPlayerIds } },
    });

    await this.prisma.playerTeam.createMany({
      data: currentAssignments.map((assignment) => ({
        playerId: assignment.playerId,
        teamId,
        jerseyNumber: assignment.jerseyNumber,
        mainPosition: assignment.mainPosition,
        secondaryPositions: assignment.secondaryPositions,
        joinDate: season.startDate,
      })),
    });

    return { importedCount: currentAssignments.length };
  }

  private async assertSeasonIsDraft(
    clubId: number,
    teamId: number,
    seasonId: number,
  ) {
    const season = await this.seasonsService.findOne(clubId, teamId, seasonId);
    if (season.status !== 'DRAFT') {
      throw new AppException(
        'SEASONS.ROSTER_IMPORT_ONLY_FOR_DRAFT',
        HttpStatus.CONFLICT,
      );
    }
    return season;
  }
}
