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

    const rolePermissions = memberRoles
      .filter(
        (memberRole) =>
          this.isActive(memberRole) && this.matchesContext(memberRole, context),
      )
      .flatMap((memberRole) => memberRole.role.rolePermissions);

    return this.widestScope(rolePermissions, action, resource);
  }

  /**
   * Équivalent de `can()` pour un rôle plateforme (`UserRole`, indépendant de
   * tout Member/Club) — docs/modules/auth-roles.md §Rôles plateforme. Aucun
   * `matchesContext` : un UserRole est par construction indépendant du
   * contexte club/équipe.
   */
  async canAsUser(
    userId: number,
    action: PermissionAction,
    resource: string,
  ): Promise<PermissionScope | null> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    const rolePermissions = userRoles
      .filter((userRole) => this.isActive(userRole))
      .flatMap((userRole) => userRole.role.rolePermissions);

    return this.widestScope(rolePermissions, action, resource);
  }

  /** Existence pure (pas de résolution fine de permission) d'un rôle plateforme actif. */
  async hasActivePlatformRole(userId: number): Promise<boolean> {
    const now = new Date();
    const activeUserRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
    });
    return activeUserRole !== null;
  }

  /**
   * Union du scope obtenu via le Member local (s'il existe) et du scope
   * obtenu via un rôle plateforme (`UserRole`) — un Propriétaire/AdminSystème
   * qui détient aussi une fiche Member ordinaire dans un club garde l'accès
   * complet de son rôle plateforme dans ce club (décision produit explicite,
   * voir docs/modules/auth-roles.md §Rôles plateforme).
   */
  async canEffective(
    userId: number,
    memberId: number | null,
    action: PermissionAction,
    resource: string,
    context: PermissionContext = {},
  ): Promise<PermissionScope | null> {
    const [viaMember, viaPlatform] = await Promise.all([
      memberId !== null
        ? this.can(memberId, action, resource, context)
        : Promise.resolve(null),
      this.canAsUser(userId, action, resource),
    ]);
    return this.widestOf([viaMember, viaPlatform]);
  }

  private widestScope(
    rolePermissions: {
      permission: {
        resource: string;
        action: PermissionAction;
        scope: PermissionScope;
      };
    }[],
    action: PermissionAction,
    resource: string,
  ): PermissionScope | null {
    const grantedScopes = rolePermissions
      .filter(
        (rolePermission) =>
          rolePermission.permission.resource === resource &&
          rolePermission.permission.action === action,
      )
      .map((rolePermission) => rolePermission.permission.scope);

    return this.widestOf(grantedScopes);
  }

  private widestOf(scopes: (PermissionScope | null)[]): PermissionScope | null {
    return scopes.reduce<PermissionScope | null>((widest, scope) => {
      if (!scope) return widest;
      if (!widest) return scope;
      return SCOPE_ORDER.indexOf(scope) > SCOPE_ORDER.indexOf(widest)
        ? scope
        : widest;
    }, null);
  }

  private isActive(role: {
    startDate: Date | null;
    endDate: Date | null;
  }): boolean {
    const now = new Date();
    if (role.startDate && role.startDate > now) return false;
    if (role.endDate && role.endDate < now) return false;
    return true;
  }

  private matchesContext(
    memberRole: { clubId: number | null; teamId: number | null },
    context: PermissionContext,
  ): boolean {
    if (memberRole.clubId === null) {
      return true; // scope global — legacy, voir docs/modules/auth-roles.md
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
