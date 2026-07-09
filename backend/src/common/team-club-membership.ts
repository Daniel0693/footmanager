import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Vérifie qu'une équipe appartient bien au club visé par l'URL. Même
 * requête reprise à l'identique dans 3 services avant mutualisation
 * (staff d'équipe, appartenances joueur↔équipe, événements) — seul le code
 * d'erreur différait, conservé par module en paramètre pour garder des
 * messages distincts côté frontend.
 */
export async function assertTeamInClub(
  prisma: PrismaService,
  clubId: number,
  teamId: number,
  notFoundErrorCode: string,
): Promise<void> {
  const team = await prisma.team.findFirst({ where: { id: teamId, clubId } });
  if (!team) {
    throw new AppException(notFoundErrorCode, HttpStatus.BAD_REQUEST);
  }
}
