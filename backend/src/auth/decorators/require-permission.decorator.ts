import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '@prisma/client';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: PermissionAction;
}

/**
 * Déclare la permission requise pour une route, évaluée par `PermissionsGuard`
 * via `PermissionsService.can()` (docs/modules/auth-roles.md — règle d'or).
 */
export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata<string, RequiredPermission>(PERMISSION_KEY, { resource, action });
