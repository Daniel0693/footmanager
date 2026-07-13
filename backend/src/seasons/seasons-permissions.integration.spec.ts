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
 * Saisons, révisé en A14 pour un `season` désormais club-wide (route
 * `clubs/:clubId/seasons`, plus de `:teamId` dans l'URL) : AdminClub gère
 * les saisons de son club (scope CLUB, CRUD complet), Coach et Player ne
 * peuvent que consulter (scope TEAM, READ seul — transmis via `?teamId=`,
 * même pattern que `evaluation_config`, voir docs/modules/auth-roles.md
 * §"Patterns découverts"), un membre sans rôle n'a aucun accès.
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
  seasonReadTeam: { id: 1, resource: 'season', action: 'READ', scope: 'TEAM' },
  seasonCreateClub: {
    id: 2,
    resource: 'season',
    action: 'CREATE',
    scope: 'CLUB',
  },
  seasonReadClub: { id: 3, resource: 'season', action: 'READ', scope: 'CLUB' },
  seasonUpdateClub: {
    id: 4,
    resource: 'season',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  seasonDeleteClub: {
    id: 5,
    resource: 'season',
    action: 'DELETE',
    scope: 'CLUB',
  },
} as const;

const roles = {
  // Coach/Player n'ont plus, depuis A14, que la lecture sur `season` — la
  // gestion d'une saison engage tout le club, réservée à AdminClub.
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.seasonReadTeam }],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.seasonCreateClub },
      { permission: permissions.seasonReadClub },
      { permission: permissions.seasonUpdateClub },
      { permission: permissions.seasonDeleteClub },
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

/* eslint-disable @typescript-eslint/unbound-method */
const createHandler = SeasonsController.prototype.create;
const findAllHandler = SeasonsController.prototype.findAll;
const updateHandler = SeasonsController.prototype.update;
const removeHandler = SeasonsController.prototype.remove;
const activateHandler = SeasonsController.prototype.activate;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Saisons — scénario multi-rôles (SeasonsController, club-wide depuis A14)', () => {
  let guard: PermissionsGuard;
  let seasonsService: SeasonsService;
  let seasonFindFirst: jest.Mock;
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

    seasonFindFirst = jest.fn().mockResolvedValue(null); // pas de chevauchement par défaut
    seasonFindMany = jest.fn().mockResolvedValue([]);
    seasonCreate = jest.fn().mockResolvedValue({ id: 900 });
    const prismaStub = {
      season: {
        findFirst: seasonFindFirst,
        findMany: seasonFindMany,
        create: seasonCreate,
      },
    } as unknown as PrismaService;
    seasonsService = new SeasonsService(prismaStub);
  });

  it('AdminClub crée une saison pour son club', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await seasonsService.create(1, {
      name: 'Saison 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
    });
    expect(seasonCreate).toHaveBeenCalled();
  });

  it('AdminClub met à jour et active une saison de son club', async () => {
    const updateRequest = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(updateRequest, updateHandler)),
    ).resolves.toBe(true);

    const activateRequest = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(activateRequest, activateHandler)),
    ).resolves.toBe(true);
  });

  it("AdminClub d'un AUTRE club n'a aucun droit sur ce club", async () => {
    const request = {
      params: { clubId: '2' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach consulte les saisons du club en transmettant son équipe en query (?teamId=)', async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(seasonsService.findAllByClub(1)).resolves.toEqual([]);
  });

  it('Coach sans ?teamId= (ou avec un teamId où il n’a aucun rôle) est refusé — route club-only', async () => {
    const withoutTeamId = {
      params: { clubId: '1' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(withoutTeamId, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);

    const wrongTeamId = {
      params: { clubId: '1' },
      query: { teamId: '6' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(wrongTeamId, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Coach n'a plus aucun droit d'écriture sur `season` depuis A14 (gestion réservée à AdminClub)", async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
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
    await expect(
      guard.canActivate(buildContext(request, activateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(seasonCreate).not.toHaveBeenCalled();
  });

  it('Player consulte les saisons du club via ?teamId=, aucun droit d’écriture', async () => {
    const readRequest = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, findAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');

    const writeRequest = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("un membre du club sans aucun rôle n'a aucun accès", async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 500 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
