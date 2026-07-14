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
import { ChampionshipParticipantsController } from './championship-participants.controller';
import { ChampionshipParticipantsService } from './championship-participants.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * ChampionshipParticipant (Partie B, B8) : même distribution de droits que
 * `championship` (B5) — Coach CRUD complet scope TEAM, AdminClub scope
 * CLUB, Player READ seul scope TEAM, aucun accès sans rôle. L'URL porte
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
    resource: 'championship_participant',
    action: 'CREATE',
    scope: 'TEAM',
  },
  readTeam: {
    id: 2,
    resource: 'championship_participant',
    action: 'READ',
    scope: 'TEAM',
  },
  createClub: {
    id: 3,
    resource: 'championship_participant',
    action: 'CREATE',
    scope: 'CLUB',
  },
  readClub: {
    id: 4,
    resource: 'championship_participant',
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
const createHandler = ChampionshipParticipantsController.prototype.create;
const findAllHandler = ChampionshipParticipantsController.prototype.findAll;
const removeHandler = ChampionshipParticipantsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module ChampionshipParticipant — scénario multi-rôles (ChampionshipParticipantsController)', () => {
  let guard: PermissionsGuard;
  let service: ChampionshipParticipantsService;
  let teamFindFirst: jest.Mock;
  let championshipFindFirst: jest.Mock;
  let externalTeamFindFirst: jest.Mock;
  let participantFindFirst: jest.Mock;
  let participantCreate: jest.Mock;

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
    externalTeamFindFirst = jest.fn().mockResolvedValue({ id: 50, clubId: 1 });
    participantFindFirst = jest.fn().mockResolvedValue(null);
    participantCreate = jest.fn().mockResolvedValue({ id: 900 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      championship: { findFirst: championshipFindFirst },
      externalTeam: { findFirst: externalTeamFindFirst },
      championshipParticipant: {
        findFirst: participantFindFirst,
        findMany: jest.fn().mockResolvedValue([]),
        create: participantCreate,
      },
    } as unknown as PrismaService;
    service = new ChampionshipParticipantsService(
      prismaStub,
      permissionsService,
    );
  });

  it('Coach ajoute une équipe adverse comme participante à son championnat', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await service.create(1, 5, 100, { externalTeamId: 50 });
    expect(participantCreate).toHaveBeenCalled();
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

  it('AdminClub ajoute un participant pour n’importe quelle équipe du club', async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Player consulte les participants (READ seul), canManage=false', async () => {
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

  it("Player n'a pas la permission de créer ou supprimer un participant", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(participantCreate).not.toHaveBeenCalled();
  });
});
