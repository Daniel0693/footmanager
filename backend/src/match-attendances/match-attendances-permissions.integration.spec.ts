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
import { MatchAttendancesController } from './match-attendances.controller';
import { MatchAttendancesService } from './match-attendances.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * MatchAttendance (Phase 4, B1) : Coach CRUD complet scope TEAM (convoque,
 * consulte, corrige), AdminClub/SuperAdmin READ CLUB/ALL uniquement (jamais
 * CREATE/UPDATE/DELETE — décision actée en A0, docs/modules/matchs.md
 * §Droits par rôle : AdminClub n'a qu'une lecture sur les sous-ressources
 * live/composition/présences), Player répond à sa propre convocation
 * (scope OWN, READ+UPDATE seuls), Parent répond pour son enfant (scope
 * PARENT, READ+UPDATE seuls).
 */

const coachMember: Member = {
  id: 43,
  userId: 71,
  clubId: 1,
  firstName: 'Daniel',
  lastName: 'Coach',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const playerMember: Member = {
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

const parentMember: Member = {
  id: 44,
  userId: 72,
  clubId: 2,
  firstName: 'Sophie',
  lastName: 'Parent',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const permissions = {
  createTeam: {
    id: 1,
    resource: 'match_attendance',
    action: 'CREATE',
    scope: 'TEAM',
  },
  readTeam: {
    id: 2,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 3,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  deleteTeam: {
    id: 4,
    resource: 'match_attendance',
    action: 'DELETE',
    scope: 'TEAM',
  },
  readOwn: {
    id: 5,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'OWN',
  },
  updateOwn: {
    id: 6,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'OWN',
  },
  readParent: {
    id: 7,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'PARENT',
  },
  updateParent: {
    id: 8,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'PARENT',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.createTeam },
      { permission: permissions.readTeam },
      { permission: permissions.updateTeam },
      { permission: permissions.deleteTeam },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.readOwn },
      { permission: permissions.updateOwn },
    ],
  },
  parent: {
    id: 3,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.readParent },
      { permission: permissions.updateParent },
    ],
  },
};

const memberRolesByMember: Record<number, any[]> = {
  43: [
    {
      memberId: 43,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.coach,
    },
  ],
  42: [
    {
      memberId: 42,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.player,
    },
  ],
  44: [
    {
      memberId: 44,
      clubId: 2,
      teamId: 12,
      startDate: null,
      endDate: null,
      role: roles.parent,
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

/* eslint-disable @typescript-eslint/unbound-method */
const createBulkHandler = MatchAttendancesController.prototype.createBulk;
const findAllHandler = MatchAttendancesController.prototype.findAll;
const updateHandler = MatchAttendancesController.prototype.update;
const removeHandler = MatchAttendancesController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module MatchAttendance — scénario multi-rôles (MatchAttendancesController)', () => {
  let guard: PermissionsGuard;
  let service: MatchAttendancesService;
  let teamFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let attendanceCreateMany: jest.Mock;
  let attendanceFindMany: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '7:1': playerMember,
      '72:2': parentMember,
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

    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    matchFindFirst = jest.fn().mockResolvedValue({ id: 900 });
    attendanceCreateMany = jest.fn();
    attendanceFindMany = jest.fn().mockResolvedValue([]);
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
      match: { findFirst: matchFindFirst },
      matchAttendance: {
        findMany: attendanceFindMany,
        createMany: attendanceCreateMany,
      },
      playerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      parentChild: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    service = new MatchAttendancesService(prismaStub, permissionsService);
  });

  it('Coach convoque des joueurs pour un match de son équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await service.createBulk(1, 5, 900, [10, 11]);
    expect(attendanceCreateMany).toHaveBeenCalled();
  });

  it("Coach n'a aucun droit sur une AUTRE équipe", async () => {
    const request = {
      params: { clubId: '1', teamId: '6', matchId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player consulte (scope OWN) et répond à sa propre convocation, ne peut jamais convoquer', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('OWN');
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(attendanceCreateMany).not.toHaveBeenCalled();
  });

  it('Parent consulte (scope PARENT) et répond à la convocation de son enfant', async () => {
    const request = {
      params: { clubId: '2', teamId: '12', matchId: '900' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('PARENT');
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
