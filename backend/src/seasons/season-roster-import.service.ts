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
   *
   * Dédoublonné par joueur (correctif 2026-07-13) : un joueur peut avoir
   * PLUSIEURS affectations actives simultanées sur cette équipe — cas normal
   * tant qu'aucune saison n'a encore été activée (voir importRoster
   * ci-dessous), par ex. après une tentative de wizard abandonnée avant
   * l'activation. Un seul candidat par joueur est présenté ici (le plus
   * récent), jamais une ligne par affectation.
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

    return this.dedupeByPlayer(assignments).map((assignment) => ({
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
   *
   * Dédoublonné par joueur avant création (correctif 2026-07-13) : au plus
   * UNE nouvelle affectation par joueur demandé, quel que soit le nombre
   * d'affectations actives déjà existantes pour lui (ex. wizard relancé
   * après une tentative précédente jamais activée) — sans ce garde-fou, un
   * joueur ayant déjà 2 affectations actives en recevait 2 nouvelles au lieu
   * d'une, doublant le problème à chaque nouvelle tentative.
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
    const deduped = this.dedupeByPlayer(currentAssignments);

    await this.prisma.playerTeam.createMany({
      data: deduped.map((assignment) => ({
        playerId: assignment.playerId,
        teamId,
        jerseyNumber: assignment.jerseyNumber,
        mainPosition: assignment.mainPosition,
        secondaryPositions: assignment.secondaryPositions,
        joinDate: season.startDate,
      })),
    });

    return { importedCount: deduped.length };
  }

  /**
   * Une affectation par joueur : quand plusieurs affectations actives
   * coexistent pour le même joueur (cas normal avant activation, voir
   * ci-dessus), retient la plus récente (`joinDate` le plus tardif, `id` le
   * plus élevé en dernier recours) comme représentante. L'ordre relatif des
   * joueurs (déjà trié par nom en amont) est préservé : `Map` conserve
   * l'ordre de la PREMIÈRE occurrence de chaque clé, et les affectations
   * d'un même joueur (même nom) sont nécessairement adjacentes dans le
   * résultat trié par nom.
   */
  private dedupeByPlayer<
    T extends { playerId: number; joinDate: Date | null; id: number },
  >(assignments: T[]): T[] {
    const byPlayer = new Map<number, T>();
    for (const assignment of assignments) {
      const existing = byPlayer.get(assignment.playerId);
      if (!existing || this.isMoreRecent(assignment, existing)) {
        byPlayer.set(assignment.playerId, assignment);
      }
    }
    return [...byPlayer.values()];
  }

  private isMoreRecent<T extends { joinDate: Date | null; id: number }>(
    candidate: T,
    current: T,
  ): boolean {
    if (candidate.joinDate && current.joinDate) {
      return candidate.joinDate > current.joinDate;
    }
    if (candidate.joinDate && !current.joinDate) return true;
    if (!candidate.joinDate && current.joinDate) return false;
    return candidate.id > current.id;
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
