import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Complète `PermissionsGuard` pour un scope TEAM (Coach) : le guard vérifie
 * seulement "ce membre a-t-il un rôle sur CE teamId", jamais que le joueur
 * ciblé par l'URL appartient bien à cette équipe. Sans cet appel, un Coach
 * pourrait agir sur n'importe quel joueur du club en transmettant sa propre
 * équipe en query (faille trouvée en concevant A7.3, voir
 * docs/modules/auth-roles.md §Patterns découverts). Seules les affectations
 * ACTIVES comptent (`leaveDate: null`), cohérent avec le reste du module
 * Effectif (ex. unicité du numéro de maillot).
 */
export async function assertPlayerInTeam(
  prisma: PrismaService,
  playerId: number,
  teamId: number | undefined,
): Promise<void> {
  if (teamId === undefined) {
    throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
  }

  const assignment = await prisma.playerTeam.findFirst({
    where: { playerId, teamId, leaveDate: null },
  });
  if (!assignment) {
    throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
  }
}
