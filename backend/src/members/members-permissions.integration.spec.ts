import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { MembersController } from './members.controller';

/**
 * Scénario multi-rôles de référence appliqué à la création de membre
 * (docs/modules/auth-roles.md) : un AdminClub peut ajouter un membre à son
 * club, un Coach (scope TEAM, pas de CREATE sur `member`) et un Player
 * (scope OWN en lecture uniquement) ne le peuvent pas.
 */

const adminClubMember: Member = {
  id: 99,
  userId: 70,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Admin',
  phone: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const coachMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Coach',
  phone: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const playerMember: Member = {
  id: 55,
  userId: 8,
  clubId: 1,
  firstName: 'Tom',
  lastName: 'Joueur',
  phone: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const permissions = {
  memberCreateClub: {
    id: 1,
    resource: 'member',
    action: 'CREATE',
    scope: 'CLUB',
  },
  memberUpdateTeam: {
    id: 2,
    resource: 'member',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  memberReadOwn: {
    id: 3,
    resource: 'member',
    action: 'READ',
    scope: 'OWN',
  },
} as const;

const roles = {
  adminClub: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.memberCreateClub }],
  },
  coach: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.memberUpdateTeam }],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.memberReadOwn }],
  },
};

// memberId 99 = AdminClub du club 1 (scope club entier, teamId null).
// memberId 42 = Marc, Coach du club 1 (scope TEAM, pas de CREATE membre).
// memberId 55 = Tom, Player du club 1 (scope OWN, lecture seule).
const memberRolesByMember: Record<number, any[]> = {
  99: [
    {
      memberId: 99,
      clubId: 1,
      teamId: null,
      startDate: null,
      endDate: null,
      role: roles.adminClub,
    },
  ],
  42: [
    {
      memberId: 42,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.coach,
    },
  ],
  55: [
    {
      memberId: 55,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.player,
    },
  ],
};

function buildPrismaStub() {
  return {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
  } as unknown as PrismaService;
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

// Référence pure à la méthode du controller, utilisée uniquement comme cible
// de métadonnées (Reflector.get lit les décorateurs posés dessus) — jamais
// invoquée, donc aucun risque de perte de binding `this`.
// eslint-disable-next-line @typescript-eslint/unbound-method
const createHandler = MembersController.prototype.create;

describe('Module Effectif — scénario multi-rôles (MembersController.create)', () => {
  let guard: PermissionsGuard;
  let findByUserAndClub: jest.Mock;
  let membersByUserAndClub: Record<string, Member>;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    membersByUserAndClub = {
      '70:1': adminClubMember,
      '7:1': coachMember,
      '8:1': playerMember,
    };
    findByUserAndClub = jest.fn((userId: number, clubId: number) =>
      Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
    );
    const membersService = {
      findByUserAndClub,
    } as unknown as MembersService;

    guard = new PermissionsGuard(
      new Reflector(),
      permissionsService,
      membersService,
    );
  });

  it('AdminClub peut ajouter un membre à son club', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Coach (scope TEAM, pas de CREATE) ne peut pas ajouter de membre', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (lecture seule) ne peut pas ajouter de membre', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 8 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("AdminClub du club 1 n'a aucun accès pour créer un membre dans le club 2", async () => {
    const request = {
      params: { clubId: '2' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
