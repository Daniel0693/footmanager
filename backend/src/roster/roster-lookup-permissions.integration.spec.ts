import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, Team } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RosterController } from './roster.controller';
import { RosterMatchingService } from './roster-matching.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au nouvel
 * endpoint de rapprochement (`GET .../roster/lookup`,
 * docs/decisions-ouvertes-et-rgpd.md) : exerce PermissionsGuard +
 * PermissionsService (réels) + RosterMatchingService (réel) ensemble.
 *
 * Point central testé ici : PermissionsGuard n'évalue que "ce membre a-t-il
 * un scope quelconque sur player_profile READ dans ce contexte ?" — un
 * Player (scope OWN) ou un Parent (scope PARENT) en dispose légitimement
 * pour d'autres routes, et PASSE donc le guard sur cette route (elle porte
 * un teamId dans son URL, contrairement à `GET /players`/`GET /players/:id`
 * qui rejettent Player faute de teamId). C'est RosterMatchingService qui doit
 * bloquer ces deux scopes, pas le guard.
 */

const team: Team = {
  id: 8,
  clubId: 1,
  name: 'U15 A',
  category: null,
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
  clubId: 1,
  firstName: 'Paul',
  lastName: 'Parent',
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
  playerProfileReadClub: {
    id: 1,
    resource: 'player_profile',
    action: 'READ',
    scope: 'CLUB',
  },
  playerProfileReadTeam: {
    id: 2,
    resource: 'player_profile',
    action: 'READ',
    scope: 'TEAM',
  },
  playerProfileReadOwn: {
    id: 3,
    resource: 'player_profile',
    action: 'READ',
    scope: 'OWN',
  },
  playerProfileReadParent: {
    id: 4,
    resource: 'player_profile',
    action: 'READ',
    scope: 'PARENT',
  },
} as const;

const roles = {
  adminClub: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadClub }],
  },
  coach: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadTeam }],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadOwn }],
  },
  parent: {
    id: 4,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadParent }],
  },
};

// memberId 99 = AdminClub du club 1 (scope club entier, teamId null).
// memberId 43 = Daniel, Coach de l'équipe 8 (scope TEAM).
// memberId 42 = Marc, Player de l'équipe 8 (scope OWN).
// memberId 44 = Paul, Parent rattaché à l'équipe 8 (scope PARENT).
// memberId 1000 = membre du club sans aucun rôle.
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
  43: [
    {
      memberId: 43,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.coach,
    },
  ],
  42: [
    {
      memberId: 42,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.player,
    },
  ],
  44: [
    {
      memberId: 44,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.parent,
    },
  ],
  1000: [],
};

function buildPrismaStub(teamFindFirst: jest.Mock) {
  return {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findFirst: teamFindFirst },
    playerProfile: { findMany: jest.fn().mockResolvedValue([]) },
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
const lookupHandler = RosterController.prototype.lookup;

describe('Rapprochement joueur — scénario multi-rôles (RosterController.lookup)', () => {
  let guard: PermissionsGuard;
  let rosterMatchingService: RosterMatchingService;
  let teamFindFirst: jest.Mock;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    const prismaStub = buildPrismaStub(teamFindFirst);
    const permissionsService = new PermissionsService(prismaStub);

    const membersByUserAndClub: Record<string, Member> = {
      '70:1': adminClubMember,
      '71:1': coachMember,
      '7:1': playerMember,
      '72:1': parentMember,
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
    rosterMatchingService = new RosterMatchingService(prismaStub);
  });

  const identity = {
    firstName: 'Karim',
    lastName: 'Benali',
    birthDate: null,
    licenseNumber: null,
  };

  it('AdminClub (scope CLUB) peut rechercher', async () => {
    const request = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      rosterMatchingService.findMatches(
        1,
        8,
        identity,
        request.permissionScope!,
      ),
    ).resolves.toEqual({ status: 'NEW', candidates: [] });
  });

  it('Coach (scope TEAM) de sa propre équipe peut rechercher', async () => {
    const request = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      rosterMatchingService.findMatches(
        1,
        8,
        identity,
        request.permissionScope!,
      ),
    ).resolves.toEqual({ status: 'NEW', candidates: [] });
  });

  it("Coach n'a aucun accès sur une équipe où il n'a aucun rôle (pas de fuite inter-équipe)", async () => {
    const request = {
      params: { clubId: '1', teamId: '9' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (scope OWN) passe le guard (teamId présent dans l’URL) mais est refusé par le service — outil réservé au staff', async () => {
    const request = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('OWN');

    await expect(
      rosterMatchingService.findMatches(
        1,
        8,
        identity,
        request.permissionScope!,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('Parent (scope PARENT) passe le guard mais est refusé par le service', async () => {
    const request = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 72 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('PARENT');

    await expect(
      rosterMatchingService.findMatches(
        1,
        8,
        identity,
        request.permissionScope!,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it("un membre du club sans aucun rôle n'a aucun accès", async () => {
    const request = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 500 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, lookupHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
