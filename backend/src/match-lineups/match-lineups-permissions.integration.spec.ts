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
import { MatchLineupsController } from './match-lineups.controller';
import { MatchLineupsService } from './match-lineups.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * MatchLineup (Phase 4, B2) : Coach CRUD complet scope TEAM (prépare la
 * composition), AdminClub READ CLUB uniquement (jamais d'écriture — décision
 * actée en A0, docs/modules/matchs.md §Droits par rôle : "Préparer la
 * composition" est ❌ pour AdminClub), Player READ TEAM (voit la composition
 * entière, jamais de filtrage), Parent aucun accès du tout.
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
    resource: 'match_lineup',
    action: 'CREATE',
    scope: 'TEAM',
  },
  readTeam: { id: 2, resource: 'match_lineup', action: 'READ', scope: 'TEAM' },
  deleteTeam: {
    id: 3,
    resource: 'match_lineup',
    action: 'DELETE',
    scope: 'TEAM',
  },
  readClub: { id: 4, resource: 'match_lineup', action: 'READ', scope: 'CLUB' },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.createTeam },
      { permission: permissions.readTeam },
      { permission: permissions.deleteTeam },
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
const upsertBulkHandler = MatchLineupsController.prototype.upsertBulk;
const findAllHandler = MatchLineupsController.prototype.findAll;
const removeHandler = MatchLineupsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module MatchLineup — scénario multi-rôles (MatchLineupsController)', () => {
  let guard: PermissionsGuard;
  let service: MatchLineupsService;
  let teamFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let lineupUpsert: jest.Mock;
  let lineupFindMany: jest.Mock;

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
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    matchFindFirst = jest.fn().mockResolvedValue({ id: 900 });
    lineupUpsert = jest.fn();
    lineupFindMany = jest.fn().mockResolvedValue([]);
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
      match: { findFirst: matchFindFirst },
      matchLineup: {
        upsert: lineupUpsert,
        findMany: lineupFindMany,
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(
        (arg: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
          typeof arg === 'function' ? arg(prismaStub) : Promise.all(arg),
      ),
    } as unknown as PrismaService;
    service = new MatchLineupsService(prismaStub, permissionsService);
  });

  it('Coach prépare la composition de son équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, upsertBulkHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await service.upsertBulk(
      1,
      5,
      900,
      [{ playerId: 10, lineupStatus: 'TITULAIRE' }],
      43,
    );
    expect(lineupUpsert).toHaveBeenCalled();
  });

  it('AdminClub consulte la composition (lecture seule), ne peut jamais la préparer ni la modifier', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      guard.canActivate(buildContext(request, upsertBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(lineupUpsert).not.toHaveBeenCalled();
  });

  it('Player consulte la composition entière de son équipe (lecture seule)', async () => {
    const request = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      guard.canActivate(buildContext(request, upsertBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Parent (Club 2) n'a aucun accès à la composition, quelle que soit l'action", async () => {
    const request = {
      params: { clubId: '2', teamId: '12', matchId: '900' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, upsertBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
