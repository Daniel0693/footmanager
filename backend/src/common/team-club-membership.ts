import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Vérifie qu'une équipe appartient bien au club visé par l'URL. Même
 * requête reprise à l'identique dans 3 services avant mutualisation
 * (staff d'équipe, appartenances joueur↔équipe, événements) — seul le code
 * d'erreur différait, conservé par module en paramètre pour garder des
 * messages distincts côté frontend.
 *
 * `404 NOT_FOUND` (pas `400 BAD_REQUEST`) : la requête est bien formée, elle
 * référence simplement une équipe qui n'existe pas dans ce club — même
 * convention que le reste du codebase pour une ressource introuvable dans
 * le scope demandé.
 */
export async function assertTeamInClub(
  prisma: PrismaService,
  clubId: number,
  teamId: number,
  notFoundErrorCode: string,
): Promise<void> {
  const team = await prisma.team.findFirst({ where: { id: teamId, clubId } });
  if (!team) {
    throw new AppException(notFoundErrorCode, HttpStatus.NOT_FOUND);
  }
}
