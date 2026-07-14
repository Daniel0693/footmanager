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
import { ChampionshipMatchesController } from './championship-matches.controller';
import { ChampionshipMatchesService } from './championship-matches.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * ChampionshipMatch (Partie B, B11) : même distribution de droits que
 * `championship`/`championship_participant` — Coach CRUD complet scope
 * TEAM, AdminClub scope CLUB, Player READ seul scope TEAM. L'URL porte
 * toujours teamId (pas de contournement `?teamId=`).
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

const permissions = {
  createTeam: {
    id: 1,
    resource: 'championship_match',
    action: 'CREATE',
    scope: 'TEAM',
  },
  readTeam: {
    id: 2,
    resource: 'championship_match',
    action: 'READ',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 3,
    resource: 'championship_match',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  createClub: {
    id: 4,
    resource: 'championship_match',
    action: 'CREATE',
    scope: 'CLUB',
  },
  readClub: {
    id: 5,
    resource: 'championship_match',
    action: 'READ',
    scope: 'CLUB',
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
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.createClub },
      { permission: permissions.readClub },
    ],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readTeam }],
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
const createHandler = ChampionshipMatchesController.prototype.create;
const findAllHandler = ChampionshipMatchesController.prototype.findAll;
const updateHandler = ChampionshipMatchesController.prototype.update;
const removeHandler = ChampionshipMatchesController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module ChampionshipMatch — scénario multi-rôles (ChampionshipMatchesController)', () => {
  let guard: PermissionsGuard;
  let service: ChampionshipMatchesService;
  let teamFindFirst: jest.Mock;
  let championshipFindFirst: jest.Mock;
  let participantFindFirst: jest.Mock;
  let matchCreate: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '70:1': adminClubMember,
      '7:1': playerMember,
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
    championshipFindFirst = jest.fn().mockResolvedValue({ id: 100, teamId: 5 });
    participantFindFirst = jest
      .fn()
      .mockImplementation(({ where: { id } }: { where: { id: number } }) =>
        Promise.resolve(
          [
            { id: 1, championshipId: 100 },
            { id: 2, championshipId: 100 },
          ].find((p) => p.id === id) ?? null,
        ),
      );
    matchCreate = jest.fn().mockResolvedValue({ id: 900 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      championship: { findFirst: championshipFindFirst },
      championshipParticipant: { findFirst: participantFindFirst },
      championshipMatch: {
        findMany: jest.fn().mockResolvedValue([]),
        create: matchCreate,
      },
    } as unknown as PrismaService;
    service = new ChampionshipMatchesService(prismaStub, permissionsService);
  });

  it('Coach planifie une rencontre pour son championnat', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await service.create(1, 5, 100, {
      homeParticipantId: 1,
      awayParticipantId: 2,
      scheduledAt: new Date('2026-09-15'),
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

  it('AdminClub planifie une rencontre pour n’importe quelle équipe du club', async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Player consulte les rencontres (READ seul), canManage=false', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(service.findAllByChampionship(1, 5, 100, 42)).resolves.toEqual(
      { data: [], canManage: false },
    );
  });

  it("Player n'a pas la permission de créer, modifier ou supprimer une rencontre", async () => {
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
});
