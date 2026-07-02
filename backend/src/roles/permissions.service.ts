import { Injectable } from '@nestjs/common';
import { PermissionAction, PermissionScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PermissionContext {
  clubId?: number;
  teamId?: number;
}

const SCOPE_ORDER: PermissionScope[] = ['OWN', 'TEAM', 'CLUB', 'ALL'];

/**
 * Cœur de la règle d'or de permission (docs/modules/auth-roles.md) :
 * toute permission est évaluée via MemberRole + RolePermission, scopée au
 * contexte précis de l'action (club et/ou équipe). Aucun raccourci sur le nom
 * du rôle n'est autorisé ici.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retourne le scope le plus large accordé au membre pour cette
   * ressource/action dans ce contexte, ou `null` si aucun rôle ne l'autorise.
   */
  async can(
    memberId: number,
    action: PermissionAction,
    resource: string,
    context: PermissionContext = {},
  ): Promise<PermissionScope | null> {
    const memberRoles = await this.prisma.memberRole.findMany({
      where: { memberId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    const grantedScopes = memberRoles
      .filter(
        (memberRole) =>
          this.isActive(memberRole) && this.matchesContext(memberRole, context),
      )
      .flatMap((memberRole) => memberRole.role.rolePermissions)
      .filter(
        (rolePermission) =>
          rolePermission.permission.resource === resource &&
          rolePermission.permission.action === action,
      )
      .map((rolePermission) => rolePermission.permission.scope);

    if (grantedScopes.length === 0) {
      return null;
    }

    return grantedScopes.reduce((widest, scope) =>
      SCOPE_ORDER.indexOf(scope) > SCOPE_ORDER.indexOf(widest) ? scope : widest,
    );
  }

  private isActive(memberRole: {
    startDate: Date | null;
    endDate: Date | null;
  }): boolean {
    const now = new Date();
    if (memberRole.startDate && memberRole.startDate > now) return false;
    if (memberRole.endDate && memberRole.endDate < now) return false;
    return true;
  }

  private matchesContext(
    memberRole: { clubId: number | null; teamId: number | null },
    context: PermissionContext,
  ): boolean {
    if (memberRole.clubId === null) {
      return true; // scope global (SuperAdmin / Proprietaire hors club)
    }
    if (memberRole.clubId !== context.clubId) {
      return false;
    }
    if (memberRole.teamId === null) {
      return true; // scope club entier
    }
    return memberRole.teamId === context.teamId;
  }
}
