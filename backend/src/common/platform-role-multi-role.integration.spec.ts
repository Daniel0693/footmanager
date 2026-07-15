import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, Role, User } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import { isDateRangeActive } from './date-range-active';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsController } from '../teams/teams.controller';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire") appliqué aux rôles plateforme
 * (SuperAdmin/Proprietaire, docs/modules/auth-roles.md §Rôles plateforme) :
 * Alice détient un UserRole Proprietaire (rôle plateforme, indépendant de
 * tout club) mais n'a **aucune** fiche Member, nulle part — le point central
 * du mécanisme introduit pour corriger la limitation "un SuperAdmin doit
 * avoir un Member par club accédé" (auth-roles.md, ancienne section
 * "Multi-club limitation").
 *
 * Exerce PermissionsGuard + PermissionsService + MembersService (réels)
 * ensemble contre un double Prisma en mémoire, plutôt que des mocks isolés
 * — même esprit que championship-multi-role.integration.spec.ts, mais le
 * double Prisma est ici mutable (les Member provisionnés doivent persister
 * pour que les assertions suivantes les retrouvent), ce qu'un stub
 * jest.fn() classique ne permet pas d'exprimer simplement.
 */

class InMemoryPrisma {
  private nextMemberId = 1;
  users: User[] = [];
  members: Member[] = [];
  memberRoles: {
    memberId: number;
    clubId: number | null;
    teamId: number | null;
    startDate: Date | null;
    endDate: Date | null;
    role: unknown;
  }[] = [];
  userRoles: {
    userId: number;
    startDate: Date | null;
    endDate: Date | null;
    role: unknown;
  }[] = [];

  user = {
    findUnique: ({ where: { id } }: { where: { id: number } }) =>
      Promise.resolve(this.users.find((u) => u.id === id) ?? null),
  };

  member = {
    findUnique: ({
      where: {
        userId_clubId: { userId, clubId },
      },
    }: {
      where: { userId_clubId: { userId: number; clubId: number } };
    }) =>
      Promise.resolve(
        this.members.find((m) => m.userId === userId && m.clubId === clubId) ??
          null,
      ),
    upsert: ({
      where: {
        userId_clubId: { userId, clubId },
      },
      create,
    }: {
      where: { userId_clubId: { userId: number; clubId: number } };
      create: Pick<Member, 'userId' | 'clubId' | 'firstName' | 'lastName'>;
    }) => {
      const existing = this.members.find(
        (m) => m.userId === userId && m.clubId === clubId,
      );
      if (existing) return Promise.resolve(existing);
      const created: Member = {
        id: this.nextMemberId++,
        phone: null,
        avatarUrl: null,
        gender: null,
        birthDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...create,
      };
      this.members.push(created);
      return Promise.resolve(created);
    },
  };

  memberRole = {
    findMany: ({ where: { memberId } }: { where: { memberId: number } }) =>
      Promise.resolve(
        this.memberRoles.filter((mr) => mr.memberId === memberId),
      ),
  };

  userRole = {
    findMany: ({ where: { userId } }: { where: { userId: number } }) =>
      Promise.resolve(this.userRoles.filter((ur) => ur.userId === userId)),
    findFirst: ({ where: { userId } }: { where: { userId: number } }) => {
      const active = this.userRoles.find(
        (ur) => ur.userId === userId && isDateRangeActive(ur),
      );
      return Promise.resolve(active ?? null);
    },
  };
}

function buildContext(
  request: Partial<PermissionedRequest>,
  handler: (...args: any[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

/* eslint-disable @typescript-eslint/unbound-method */
const teamsFindAllHandler = TeamsController.prototype.findAll;
/* eslint-enable @typescript-eslint/unbound-method */

const proprietaireRole: Role = {
  id: 1,
  name: 'Proprietaire',
  description: null,
  isSystem: true,
  clubId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Rôles plateforme — scénario multi-rôles (PermissionsGuard + MembersService)', () => {
  let prisma: InMemoryPrisma;
  let guard: PermissionsGuard;

  const alice: User = {
    id: 900,
    email: 'alice.proprietaire@footmanager.io',
    passwordHash: 'hash',
    emailVerified: true,
    locale: 'fr',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = new InMemoryPrisma();
    prisma.users = [alice];
    prisma.userRoles = [
      {
        userId: alice.id,
        startDate: null,
        endDate: null,
        role: {
          ...proprietaireRole,
          rolePermissions: [
            {
              permission: { resource: 'team', action: 'READ', scope: 'ALL' },
            },
          ],
        },
      },
    ];

    const permissionsService = new PermissionsService(
      prisma as unknown as PrismaService,
    );
    const membersService = new MembersService(
      prisma as unknown as PrismaService,
      permissionsService,
    );
    guard = new PermissionsGuard(
      new Reflector(),
      permissionsService,
      membersService,
    );
  });

  it("Alice (Proprietaire, UserRole) accède à un club où elle n'a jamais eu de Member — scope ALL sans aucune donnée préexistante", async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: alice.id },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, teamsFindAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('ALL');
  });

  it('provisionne un Member à la volée (upsert), jamais avant que l’accès ait été accordé', async () => {
    expect(prisma.members).toHaveLength(0);

    const request = {
      params: { clubId: '1' },
      user: { userId: alice.id },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, teamsFindAllHandler));

    expect(prisma.members).toHaveLength(1);
    const provisioned = request.member!;
    expect(provisioned.userId).toBe(alice.id);
    expect(provisioned.clubId).toBe(1);
    // Nom placeholder dérivé de l'email (User n'a aucun champ nom) — voir
    // MembersService.resolveOrProvisionMember.
    expect(provisioned.firstName).toBe('alice.proprietaire');
    expect(provisioned.lastName).toBe('(compte plateforme)');
  });

  it("un second club, jamais visité non plus, fonctionne aussi sans configuration supplémentaire (preuve de l'indépendance club)", async () => {
    const requestClub1 = {
      params: { clubId: '1' },
      user: { userId: alice.id },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(requestClub1, teamsFindAllHandler));

    const requestClub2 = {
      params: { clubId: '2' },
      user: { userId: alice.id },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(requestClub2, teamsFindAllHandler)),
    ).resolves.toBe(true);
    expect(requestClub2.permissionScope).toBe('ALL');

    expect(prisma.members).toHaveLength(2);
    expect(requestClub1.member!.id).not.toBe(requestClub2.member!.id);
    expect(requestClub2.member!.clubId).toBe(2);
  });

  it('cas témoin — un utilisateur sans Member ni rôle plateforme reste refusé (403), aucun provisioning', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 12345 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, teamsFindAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.members).toHaveLength(0);
  });
});
