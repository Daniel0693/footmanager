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
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * Match (Phase 4, A2) : Coach CRUD complet scope TEAM, AdminClub CRUD
 * complet scope CLUB (contrairement aux sous-ressources live/composition à
 * venir en Parties B/C, où AdminClub n'a que READ — voir
 * docs/modules/matchs.md §Droits par rôle), Player/Parent READ seul
 * (TEAM/PARENT). L'URL porte toujours teamId (pas de contournement
 * `?teamId=`).
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
  createTeam: { id: 1, resource: 'match', action: 'CREATE', scope: 'TEAM' },
  readTeam: { id: 2, resource: 'match', action: 'READ', scope: 'TEAM' },
  updateTeam: { id: 3, resource: 'match', action: 'UPDATE', scope: 'TEAM' },
  deleteTeam: { id: 4, resource: 'match', action: 'DELETE', scope: 'TEAM' },
  createClub: { id: 5, resource: 'match', action: 'CREATE', scope: 'CLUB' },
  readClub: { id: 6, resource: 'match', action: 'READ', scope: 'CLUB' },
  updateClub: { id: 7, resource: 'match', action: 'UPDATE', scope: 'CLUB' },
  deleteClub: { id: 8, resource: 'match', action: 'DELETE', scope: 'CLUB' },
  readParent: { id: 9, resource: 'match', action: 'READ', scope: 'PARENT' },
  // "Clore le match" (docs/modules/matchs.md §Droits par rôle) est gardé par
  // match_period UPDATE, pas match UPDATE — AdminClub gère la fiche match
  // mais jamais le live (voir le test dédié plus bas).
  periodUpdateTeam: {
    id: 10,
    resource: 'match_period',
    action: 'UPDATE',
    scope: 'TEAM',
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
      { permission: permissions.periodUpdateTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.createClub },
      { permission: permissions.readClub },
      { permission: permissions.updateClub },
      { permission: permissions.deleteClub },
    ],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readTeam }],
  },
  parent: {
    id: 4,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readParent }],
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
const createHandler = MatchesController.prototype.create;
const findAllHandler = MatchesController.prototype.findAll;
const updateHandler = MatchesController.prototype.update;
const removeHandler = MatchesController.prototype.remove;
const closeHandler = MatchesController.prototype.close;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Match — scénario multi-rôles (MatchesController)', () => {
  let guard: PermissionsGuard;
  let service: MatchesService;
  let teamFindFirst: jest.Mock;
  let externalTeamFindFirst: jest.Mock;
  let eventCreate: jest.Mock;
  let matchCreate: jest.Mock;
  let matchFindMany: jest.Mock;

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
    externalTeamFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 20, clubId: 1, name: 'FC Rivals' });
    eventCreate = jest.fn().mockResolvedValue({ id: 300 });
    matchCreate = jest.fn().mockResolvedValue({ id: 900 });
    matchFindMany = jest.fn().mockResolvedValue([]);
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      externalTeam: { findFirst: externalTeamFindFirst },
      event: { create: eventCreate },
      match: { create: matchCreate, findMany: matchFindMany },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;
    service = new MatchesService(prismaStub, permissionsService);
  });

  it('Coach crée un match Amical pour son équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await service.create(1, 5, {
      title: 'Amical vs FC Rivals',
      startAt: new Date('2026-10-01T18:00:00Z'),
      matchType: 'AMICAL',
      opponentExternalTeamId: 20,
      homeOrAway: 'HOME',
    });
    expect(matchCreate).toHaveBeenCalled();
  });

  it("Coach n'a aucun droit sur une AUTRE équipe", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("AdminClub crée/modifie/supprime un match pour n'importe quelle équipe du club (jamais le live — Parties B/C)", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).resolves.toBe(true);
  });

  it('Coach peut clore un match de son équipe (match_period UPDATE) ; AdminClub ne peut jamais le faire malgré son CRUD complet sur match', async () => {
    const coachRequest = {
      params: { clubId: '1', teamId: '5', id: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(coachRequest, closeHandler)),
    ).resolves.toBe(true);
    expect(coachRequest.permissionScope).toBe('TEAM');

    const adminClubRequest = {
      params: { clubId: '1', teamId: '6', id: '900' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(adminClubRequest, closeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player consulte les matchs de son équipe (READ seul), canManage=false', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(service.findAllByTeam(1, 5, 42)).resolves.toEqual({
      data: [],
      canManage: false,
    });
  });

  it("Player n'a pas la permission de créer, modifier ou supprimer un match", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(matchCreate).not.toHaveBeenCalled();
  });

  it("Parent consulte (scope PARENT) les matchs de l'équipe de son enfant", async () => {
    const request = {
      params: { clubId: '2', teamId: '12' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('PARENT');
  });

  it("Parent (club B, aucune équipe en commun) n'a aucun droit sur les matchs du club A", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
