import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PermissionedRequest } from '../guards/permissions.guard';

/**
 * Le `Member` résolu par `PermissionsGuard` pour le `clubId` de la requête.
 * Utilisable uniquement sur une route protégée par `PermissionsGuard`.
 */
export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<PermissionedRequest>();
    return request.member;
  },
);
