import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PermissionScope } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MembersService } from '../../members/members.service';
import { PermissionsService } from '../../roles/permissions.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';

export interface PermissionedRequest extends AuthenticatedRequest {
  member: Member;
  permissionScope: PermissionScope;
}

/**
 * Applique la règle d'or de docs/modules/auth-roles.md : résout le `Member`
 * de l'utilisateur pour le `clubId` visé (s'il existe), puis délègue
 * l'évaluation à `PermissionsService.canEffective()` — union du scope
 * accordé via ce `Member` et du scope accordé via un rôle plateforme
 * (`UserRole`, SuperAdmin/Proprietaire, docs/modules/auth-roles.md §Rôles
 * plateforme), scopée au club/équipe de la requête. Si l'accès n'est
 * accordé que via un rôle plateforme et qu'aucun `Member` n'existe encore
 * pour ce club, une fiche est provisionnée à la volée (jamais avant que
 * l'autorisation ait réussi).
 *
 * Résout `clubId`/`teamId` depuis les params de route, sinon le body, sinon
 * la query — aucune requête DB pour les résoudre. Les routes portant sur une
 * ressource déjà identifiée (ex. `/players/:id`) doivent donc exposer
 * `clubId` dans l'URL ou le body ; le filtrage fin au-delà (ex. quelles
 * équipes précises un Coach couvre) reste la responsabilité du service.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly membersService: MembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermissionedRequest>();
    const clubId = this.resolveNumericContext(request, 'clubId');
    const teamId = this.resolveNumericContext(request, 'teamId');

    if (clubId === undefined) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const member = await this.membersService.findByUserAndClub(
      request.user.userId,
      clubId,
    );

    const scope = await this.permissionsService.canEffective(
      request.user.userId,
      member?.id ?? null,
      required.action,
      required.resource,
      { clubId, teamId },
    );
    if (!scope) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    // Provisionné uniquement après succès de l'autorisation, jamais avant —
    // un utilisateur sans droit sur ce club ne crée jamais de Member en
    // sondant des clubId arbitraires (docs/modules/auth-roles.md §Rôles
    // plateforme).
    request.member =
      member ??
      (await this.membersService.resolveOrProvisionMember(
        request.user.userId,
        clubId,
      ));
    request.permissionScope = scope;
    return true;
  }

  private resolveNumericContext(
    request: AuthenticatedRequest,
    key: 'clubId' | 'teamId',
  ): number | undefined {
    const raw =
      request.params?.[key] ??
      (request.body as Record<string, unknown> | undefined)?.[key] ??
      request.query?.[key];
    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
