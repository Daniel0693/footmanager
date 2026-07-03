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
 * de l'utilisateur pour le `clubId` visé, puis délègue l'évaluation à
 * `PermissionsService.can()`, scopée au club/équipe de la requête.
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
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const scope = await this.permissionsService.can(
      member.id,
      required.action,
      required.resource,
      { clubId, teamId },
    );
    if (!scope) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    request.member = member;
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
