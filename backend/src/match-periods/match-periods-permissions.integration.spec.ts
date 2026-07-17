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
import { MatchPeriodsController } from './match-periods.controller';
import { MatchPeriodsService } from './match-periods.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * MatchPeriod (Phase 4, Partie C, C1) : Coach CRUD complet scope TEAM
 * (lance/termine les périodes de ses équipes), AdminClub READ CLUB
 * uniquement (jamais d'écriture — "Gérer le live" est ❌ pour AdminClub,
 * docs/modules/matchs.md §Droits par rôle), Player READ TEAM (suit le
 * déroulé mais ne gère rien), Parent aucun accès (`match_period` absent de
 * son jeu de permissions, contrairement à `match` scope PARENT).
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
    resource: 'match_period',
    action: 'CREATE',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 2,
    resource: 'match_period',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  readTeam: { id: 3, resource: 'match_period', action: 'READ', scope: 'TEAM' },
  readClub: { id: 4, resource: 'match_period', action: 'READ', scope: 'CLUB' },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.createTeam },
      { permission: permissions.updateTeam },
      { permission: permissions.readTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readClub }],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readTeam }],
  },
  parent: { id: 4, isSystem: true, rolePermissions: [] },
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
const startNextHandler = MatchPeriodsController.prototype.startNext;
const endCurrentHandler = MatchPeriodsController.prototype.endCurrent;
const findAllHandler = MatchPeriodsController.prototype.findAll;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module MatchPeriod — scénario multi-rôles (MatchPeriodsController)', () => {
  let guard: PermissionsGuard;
  let service: MatchPeriodsService;
  let teamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let periodCreate: jest.Mock;
  let periodFindFirst: jest.Mock;
  let periodFindMany: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '70:1': adminClubMember,
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
    matchFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 900, status: 'SCHEDULED' });
    periodCreate = jest
      .fn()
      .mockResolvedValue({ id: 1, matchId: 900, periodNumber: 1 });
    periodFindFirst = jest.fn().mockResolvedValue(null);
    periodFindMany = jest.fn().mockResolvedValue([]);
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      match: { findFirst: matchFindFirst, update: jest.fn() },
      matchPeriod: {
        create: periodCreate,
        findFirst: periodFindFirst,
        findMany: periodFindMany,
        update: jest.fn(),
      },
      $transaction: jest.fn((arg: (tx: unknown) => unknown) => arg(prismaStub)),
    } as unknown as PrismaService;
    service = new MatchPeriodsService(prismaStub, permissionsService);
  });

  it('Coach lance et termine une période de match pour son équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, startNextHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');
    await expect(
      guard.canActivate(buildContext(request, endCurrentHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);

    await service.startNext(1, 5, 900);
    expect(periodCreate).toHaveBeenCalled();
  });

  it('AdminClub consulte le déroulé (lecture seule), ne peut jamais lancer ni terminer une période', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      guard.canActivate(buildContext(request, startNextHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, endCurrentHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(periodCreate).not.toHaveBeenCalled();
  });

  it('Player consulte le déroulé des périodes de son équipe (lecture seule)', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      guard.canActivate(buildContext(request, startNextHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Parent (Club 2) n'a aucun accès au déroulé des périodes, quelle que soit l'action", async () => {
    const request = {
      params: { clubId: '2', teamId: '12', matchId: '900' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, startNextHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
