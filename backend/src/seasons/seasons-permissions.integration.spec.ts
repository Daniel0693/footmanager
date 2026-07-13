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
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * Saisons (étape A2) : un Coach gère les saisons de ses équipes (scope
 * TEAM), un AdminClub gère tout le club (scope CLUB), un Player ne peut que
 * consulter les saisons de son équipe (scope TEAM, READ seul — aucune
 * permission CREATE/UPDATE/DELETE, voir backend/prisma/seed.ts), un membre
 * sans rôle n'a aucun accès. Même pattern que EventsController/TeamStaff :
 * l'URL porte toujours teamId, pas de cas "Coach sans teamId" à couvrir ici.
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

const noRoleMember: Member = {
  id: 1000,
  userId: 500,
  clubId: 1,
  firstName: 'Sans',
  lastName: 'Rôle',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const permissions = {
  seasonCreateTeam: {
    id: 1,
    resource: 'season',
    action: 'CREATE',
    scope: 'TEAM',
  },
  seasonReadTeam: { id: 2, resource: 'season', action: 'READ', scope: 'TEAM' },
  seasonDeleteTeam: {
    id: 3,
    resource: 'season',
    action: 'DELETE',
    scope: 'TEAM',
  },
  seasonUpdateTeam: {
    id: 4,
    resource: 'season',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  seasonCreateClub: {
    id: 5,
    resource: 'season',
    action: 'CREATE',
    scope: 'CLUB',
  },
  seasonReadClub: { id: 6, resource: 'season', action: 'READ', scope: 'CLUB' },
  seasonUpdateClub: {
    id: 7,
    resource: 'season',
    action: 'UPDATE',
    scope: 'CLUB',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.seasonCreateTeam },
      { permission: permissions.seasonReadTeam },
      { permission: permissions.seasonUpdateTeam },
      { permission: permissions.seasonDeleteTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.seasonCreateClub },
      { permission: permissions.seasonReadClub },
      { permission: permissions.seasonUpdateClub },
    ],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.seasonReadTeam }],
  },
};

// memberId 43 = Daniel, Coach de l'équipe 5 (U15) uniquement.
// memberId 99 = AdminClub, scope club entier (teamId null).
// memberId 42 = Marc, Player de l'équipe 5 (scope TEAM, READ seul).
// memberId 1000 = membre du club sans aucun rôle.
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
  1000: [],
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

// eslint-disable-next-line @typescript-eslint/unbound-method
const createHandler = SeasonsController.prototype.create;
// eslint-disable-next-line @typescript-eslint/unbound-method
const findAllHandler = SeasonsController.prototype.findAll;
// eslint-disable-next-line @typescript-eslint/unbound-method
const removeHandler = SeasonsController.prototype.remove;

const previewRosterHandler =
  // eslint-disable-next-line @typescript-eslint/unbound-method
  SeasonsController.prototype.previewRosterImport;
// eslint-disable-next-line @typescript-eslint/unbound-method
const importRosterHandler = SeasonsController.prototype.importRoster;

describe('Module Saisons — scénario multi-rôles (SeasonsController)', () => {
  let guard: PermissionsGuard;
  let seasonsService: SeasonsService;
  let teamFindFirst: jest.Mock;
  let seasonFindMany: jest.Mock;
  let seasonCreate: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '70:1': adminClubMember,
      '7:1': playerMember,
      '500:1': noRoleMember,
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
    seasonFindMany = jest.fn().mockResolvedValue([]);
    seasonCreate = jest.fn().mockResolvedValue({ id: 900 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      season: { findMany: seasonFindMany, create: seasonCreate },
    } as unknown as PrismaService;
    seasonsService = new SeasonsService(prismaStub);
  });

  it('Coach crée une saison pour sa propre équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await seasonsService.create(1, 5, {
      name: 'Saison 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
    });
    expect(seasonCreate).toHaveBeenCalled();
  });

  it("Coach n'a aucun droit pour créer une saison sur une AUTRE équipe", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('AdminClub crée une saison pour n’importe quelle équipe du club', async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Player consulte les saisons de son équipe (READ seul)', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(seasonsService.findAllByTeam(1, 5, {})).resolves.toEqual([]);
  });

  it("Player n'a pas la permission de créer une saison", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(seasonCreate).not.toHaveBeenCalled();
  });

  it("Player n'a pas la permission de supprimer une saison", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("un membre du club sans aucun rôle n'a aucun accès", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 500 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  describe('import du roster (étape 2 du wizard)', () => {
    it('Coach consulte et importe le roster de sa propre équipe', async () => {
      const previewRequest = {
        params: { clubId: '1', teamId: '5' },
        user: { userId: 71 },
      } as Partial<PermissionedRequest>;
      await expect(
        guard.canActivate(buildContext(previewRequest, previewRosterHandler)),
      ).resolves.toBe(true);
      expect(previewRequest.permissionScope).toBe('TEAM');

      const importRequest = {
        params: { clubId: '1', teamId: '5' },
        user: { userId: 71 },
      } as Partial<PermissionedRequest>;
      await expect(
        guard.canActivate(buildContext(importRequest, importRosterHandler)),
      ).resolves.toBe(true);
      expect(importRequest.permissionScope).toBe('TEAM');
    });

    it("Coach n'a aucun droit sur une AUTRE équipe", async () => {
      const request = {
        params: { clubId: '1', teamId: '6' },
        user: { userId: 71 },
      } as Partial<PermissionedRequest>;

      await expect(
        guard.canActivate(buildContext(request, previewRosterHandler)),
      ).rejects.toBeInstanceOf(AppException);
      await expect(
        guard.canActivate(buildContext(request, importRosterHandler)),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('AdminClub consulte et importe le roster de n’importe quelle équipe du club', async () => {
      const request = {
        params: { clubId: '1', teamId: '6' },
        user: { userId: 70 },
      } as Partial<PermissionedRequest>;

      await expect(
        guard.canActivate(buildContext(request, previewRosterHandler)),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(buildContext(request, importRosterHandler)),
      ).resolves.toBe(true);
    });

    it('Player peut consulter (READ) mais pas importer (UPDATE) le roster', async () => {
      const previewRequest = {
        params: { clubId: '1', teamId: '5' },
        user: { userId: 7 },
      } as Partial<PermissionedRequest>;
      await expect(
        guard.canActivate(buildContext(previewRequest, previewRosterHandler)),
      ).resolves.toBe(true);

      const importRequest = {
        params: { clubId: '1', teamId: '5' },
        user: { userId: 7 },
      } as Partial<PermissionedRequest>;
      await expect(
        guard.canActivate(buildContext(importRequest, importRosterHandler)),
      ).rejects.toBeInstanceOf(AppException);
    });
  });
});
