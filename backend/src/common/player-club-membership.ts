import { HttpStatus } from '@nestjs/common';
import type { PlayerProfile } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Vérifie qu'un joueur appartient bien au club (via son `Member`), sans
 * présumer d'appartenance à une équipe précise — voir `assertPlayerInTeam`
 * (`player-team-membership.ts`) pour le scope `TEAM`. Même requête reprise à
 * l'identique dans 7 services avant mutualisation (mesures, notes,
 * objectifs, évaluations, entretiens, appartenances d'équipe, absences) —
 * seul le code d'erreur différait, conservé par module en paramètre pour
 * garder des messages distincts côté frontend (chaque module a sa propre
 * clé i18n, voir docs/schema/index.md §i18n).
 */
export async function assertPlayerInClub(
  prisma: PrismaService,
  clubId: number,
  playerId: number,
  notFoundErrorCode: string,
): Promise<PlayerProfile> {
  const player = await prisma.playerProfile.findFirst({
    where: { id: playerId, member: { clubId } },
  });
  if (!player) {
    throw new AppException(notFoundErrorCode, HttpStatus.BAD_REQUEST);
  }
  return player;
}
