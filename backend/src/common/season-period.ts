import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface SeasonPeriod {
  startDate: Date;
  endDate: Date;
}

/**
 * Résout la plage de dates d'une Season pour le filtrage rétroactif des 4
 * entités de la fiche joueur concernées (docs/schema/joueurs.md §Filtrage
 * des statistiques par période — PlayerMeasurement en est explicitement
 * exclu, toujours vue complète). `teamId` : toujours transmis par le
 * frontend (la fiche joueur est ancrée à une équipe précise, voir
 * docs/modules/auth-roles.md), filtre la saison au bon scope équipe —
 * jamais résolue sans lui pour éviter qu'un id de saison d'une autre équipe
 * ne soit accepté par erreur.
 *
 * `404 NOT_FOUND` (pas `400`) si la saison ne correspond pas à cette équipe
 * — même convention que le reste du codebase pour une ressource introuvable
 * dans le scope demandé.
 */
export async function resolveSeasonPeriod(
  prisma: PrismaService,
  teamId: number | undefined,
  seasonId: number,
  notFoundErrorCode: string,
): Promise<SeasonPeriod> {
  const season = await prisma.season.findFirst({
    where: { id: seasonId, teamId },
  });
  if (!season) {
    throw new AppException(notFoundErrorCode, HttpStatus.NOT_FOUND);
  }
  return { startDate: season.startDate, endDate: season.endDate };
}
