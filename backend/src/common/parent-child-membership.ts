import { HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Complète `PermissionsGuard` pour le scope `PARENT` (docs/modules/auth-roles.md
 * §Rôle Parent) : le guard vérifie seulement "ce membre a-t-il un rôle Parent
 * dans ce club", jamais que l'enfant ciblé par l'URL lui est bien lié via
 * `ParentChild`. Même esprit que `assertPlayerInTeam` pour le scope `TEAM`.
 *
 * À appeler uniquement après avoir vérifié que ce n'est pas l'appelant
 * lui-même (`profile.memberId !== requester.memberId`) : le scope `PARENT`
 * doit toujours rester un sur-ensemble strict du scope `OWN`, pour qu'un
 * membre qui cumule un rôle Player et un rôle Parent sur le même contexte
 * club/équipe puisse toujours consulter son propre profil sans dépendre
 * d'un lien `ParentChild` sur lui-même.
 */
export async function assertParentChildLink(
  prisma: PrismaService,
  parentMemberId: number,
  childMemberId: number,
  notFoundErrorCode: string,
): Promise<void> {
  const link = await prisma.parentChild.findUnique({
    where: { parentMemberId_childMemberId: { parentMemberId, childMemberId } },
  });
  if (!link) {
    throw new AppException(notFoundErrorCode, HttpStatus.NOT_FOUND);
  }
}
