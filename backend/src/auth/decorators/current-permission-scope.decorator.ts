import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PermissionedRequest } from '../guards/permissions.guard';

/**
 * Le `PermissionScope` (OWN/TEAM/CLUB/ALL) accordé par `PermissionsGuard` pour
 * cette requête. Permet au service de restreindre finement une ressource
 * (ex. scope OWN → ne renvoyer que la ressource de l'appelant). Utilisable
 * uniquement sur une route protégée par `PermissionsGuard`.
 */
export const CurrentPermissionScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<PermissionedRequest>();
    return request.permissionScope;
  },
);
