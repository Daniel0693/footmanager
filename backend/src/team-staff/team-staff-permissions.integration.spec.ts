import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, TeamStaff } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamStaffController } from './team-staff.controller';
import { TeamStaffService } from './team-staff.service';

/**
 * Scénario multi-rôles : un Adjoint (scope TEAM) ne peut pas modifier la
 * fiche du Principal, mais un AdminClub (scope CLUB) le peut — exercé via
 * PermissionsGuard + PermissionsService (réels) + TeamStaffService (réel),
 * pas seulement via des mocks isolés (docs/modules/auth-roles.md).
 */

const adjointMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminClubMember: Member = {
  id: 99,
  userId: 70,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Admin',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const principalAssignment: TeamStaff = {
  id: 300,
  teamId: 5,
  memberId: 1, // un autre membre, pas Marc
  staffRole: 'PRINCIPAL',
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const permissions = {
  teamStaffUpdateTeam: {
    id: 1,
    resource: 'team_staff',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  teamStaffUpdateClub: {
    id: 2,
    resource: 'team_staff',
    action: 'UPDATE',
    scope: 'CLUB',
  },
} as const;

const roles = {
  adjoint: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.teamStaffUpdateTeam }],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.teamStaffUpdateClub }],
  },
};

// memberId 42 = Marc, Coach (Adjoint) de l'U15 (teamId=5) uniquement.
// memberId 99 = AdminClub, scope club entier (teamId=null).
const memberRolesByMember: Record<number, any[]> = {
  42: [
    {
      memberId: 42,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.adjoint,
    },
  ],
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
};

function buildPrismaStub() {
  return {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
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

// eslint-disable-next-line @typescript-eslint/unbound-method
const updateHandler = TeamStaffController.prototype.update;

describe('Module Effectif — scénario multi-rôles (TeamStaffController)', () => {
  let guard: PermissionsGuard;
  let teamStaffService: TeamStaffService;
  let tsFindFirst: jest.Mock;
  let tsUpdate: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '7:1': adjointMember,
      '70:1': adminClubMember,
    };
    const membersService = {
      findByUserAndClub: jest.fn((userId: number, clubId: number) =>
        Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
      ),
    } as unknown as MembersService;

    guard = new PermissionsGuard(
      new Reflector(),
      permissionsService,
      membersService,
    );

    tsFindFirst = jest.fn().mockResolvedValue(principalAssignment);
    tsUpdate = jest.fn().mockResolvedValue(principalAssignment);
    const prismaStub = {
      teamStaff: { findFirst: tsFindFirst, update: tsUpdate },
    } as unknown as PrismaService;
    teamStaffService = new TeamStaffService(prismaStub);
  });

  it("l'Adjoint (scope TEAM) est autorisé par le guard mais bloqué par le service sur la fiche du Principal", async () => {
    const request = {
      params: { clubId: '1', teamId: '5', id: '300' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, updateHandler));
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      teamStaffService.update(
        1,
        5,
        300,
        { staffRole: 'CO_ENTRAINEUR' },
        {
          memberId: request.member!.id,
          scope: request.permissionScope!,
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(tsUpdate).not.toHaveBeenCalled();
  });

  it("l'AdminClub (scope CLUB) peut modifier la fiche du Principal", async () => {
    const request = {
      params: { clubId: '1', teamId: '5', id: '300' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, updateHandler));
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      teamStaffService.update(
        1,
        5,
        300,
        { staffRole: 'CO_ENTRAINEUR' },
        {
          memberId: request.member!.id,
          scope: request.permissionScope!,
        },
      ),
    ).resolves.toBe(principalAssignment);
    expect(tsUpdate).toHaveBeenCalled();
  });

  it("l'Adjoint n'a aucun accès à une autre équipe du même club", async () => {
    const request = {
      params: { clubId: '1', teamId: '6', id: '300' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
