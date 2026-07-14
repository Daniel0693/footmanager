import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Vérifie qu'une saison appartient bien au club visé par l'URL — miroir de
 * `assertTeamInClub` (team-club-membership.ts), pour la même raison :
 * `seasonId` est transmis en body/query par l'appelant (ex. création d'un
 * Championship), jamais résolu implicitement.
 *
 * `404 NOT_FOUND` (pas `400 BAD_REQUEST`) : la requête est bien formée, elle
 * référence simplement une saison qui n'existe pas dans ce club — même
 * convention que le reste du codebase.
 */
export async function assertSeasonInClub(
  prisma: PrismaService,
  clubId: number,
  seasonId: number,
  notFoundErrorCode: string,
): Promise<void> {
  const season = await prisma.season.findFirst({
    where: { id: seasonId, clubId },
  });
  if (!season) {
    throw new AppException(notFoundErrorCode, HttpStatus.NOT_FOUND);
  }
}
