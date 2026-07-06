import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PlayerTeam, Team } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerTeamsController } from './player-teams.controller';
import { PlayerTeamsService } from './player-teams.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'effectif d'équipe : contrairement au module players (A2), les routes ici
 * portent explicitement clubId ET teamId dans l'URL, donc le scope TEAM d'un
 * Coach peut enfin être vérifié correctement par PermissionsGuard.
 */

const coachMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
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
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const teamU15: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const rosterU15: PlayerTeam[] = [
  {
    id: 200,
    playerId: 100,
    teamId: 5,
    jerseyNumber: 9,
    mainPosition: 'ST',
    secondaryPositions: [],
    joinDate: null,
    leaveDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const permissions = {
  playerTeamReadTeam: {
    id: 1,
    resource: 'player_team',
    action: 'READ',
    scope: 'TEAM',
  },
  playerTeamReadClub: {
    id: 2,
    resource: 'player_team',
    action: 'READ',
    scope: 'CLUB',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerTeamReadTeam }],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerTeamReadClub }],
  },
};

// memberId 42 = Marc, Coach de l'U15 (teamId=5) uniquement.
// memberId 99 = AdminClub, scope club entier (teamId=null).
const memberRolesByMember: Record<number, any[]> = {
  42: [
    {
      memberId: 42,
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
const findAllHandler = PlayerTeamsController.prototype.findAll;

describe('Module Effectif — scénario multi-rôles (PlayerTeamsController)', () => {
  let guard: PermissionsGuard;
  let playerTeamsService: PlayerTeamsService;
  let teamFindFirst: jest.Mock;
  let ptFindMany: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '7:1': coachMember,
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

    teamFindFirst = jest.fn().mockResolvedValue(teamU15);
    ptFindMany = jest.fn().mockResolvedValue(rosterU15);
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findMany: ptFindMany },
    } as unknown as PrismaService;
    playerTeamsService = new PlayerTeamsService(prismaStub);
  });

  it("Coach voit l'effectif de sa propre équipe (teamId=5)", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    const result = await playerTeamsService.findAllByTeam(1, 5);
    expect(result).toEqual(rosterU15);
  });

  it("Coach n'a AUCUN accès à l'effectif d'une autre équipe du même club", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("AdminClub voit l'effectif de n'importe quelle équipe de son club", async () => {
    const requestTeam5 = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(requestTeam5, findAllHandler));
    expect(requestTeam5.permissionScope).toBe('CLUB');

    const requestTeam6 = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(requestTeam6, findAllHandler));
    expect(requestTeam6.permissionScope).toBe('CLUB');
  });

  it("AdminClub d'un autre club n'a aucun accès à l'U15 du club 1", async () => {
    const request = {
      params: { clubId: '2', teamId: '5' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
