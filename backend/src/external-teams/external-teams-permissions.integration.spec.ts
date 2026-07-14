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
import { ExternalTeamsController } from './external-teams.controller';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * ExternalTeam (Partie B, B0/B2) : ressource club-scopée en base, mais
 * accordée au Coach en scope TEAM (décision 4 du plan) — route
 * `clubs/:clubId/external-teams` sans `:teamId`, donc `?teamId=` requis pour
 * le Coach. AdminClub gère en scope CLUB (pas besoin de `?teamId=`). Player
 * n'a aucun droit sur cette ressource (contrairement à `season`, voir
 * backend/prisma/seed.ts) — un membre du club sans rôle non plus.
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
  externalTeamReadTeam: {
    id: 1,
    resource: 'external_team',
    action: 'READ',
    scope: 'TEAM',
  },
  externalTeamCreateTeam: {
    id: 2,
    resource: 'external_team',
    action: 'CREATE',
    scope: 'TEAM',
  },
  externalTeamUpdateTeam: {
    id: 3,
    resource: 'external_team',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  externalTeamDeleteTeam: {
    id: 4,
    resource: 'external_team',
    action: 'DELETE',
    scope: 'TEAM',
  },
  externalTeamCreateClub: {
    id: 5,
    resource: 'external_team',
    action: 'CREATE',
    scope: 'CLUB',
  },
  externalTeamReadClub: {
    id: 6,
    resource: 'external_team',
    action: 'READ',
    scope: 'CLUB',
  },
  externalTeamUpdateClub: {
    id: 7,
    resource: 'external_team',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  externalTeamDeleteClub: {
    id: 8,
    resource: 'external_team',
    action: 'DELETE',
    scope: 'CLUB',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.externalTeamReadTeam },
      { permission: permissions.externalTeamCreateTeam },
      { permission: permissions.externalTeamUpdateTeam },
      { permission: permissions.externalTeamDeleteTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.externalTeamCreateClub },
      { permission: permissions.externalTeamReadClub },
      { permission: permissions.externalTeamUpdateClub },
      { permission: permissions.externalTeamDeleteClub },
    ],
  },
  // Player n'a aucune permission `external_team` dans le seed réel — vérifié
  // explicitement ci-dessous plutôt que supposé.
  player: { id: 3, isSystem: true, rolePermissions: [] },
};

// memberId 43 = Daniel, Coach de l'équipe 5 (U15) uniquement.
// memberId 99 = AdminClub, scope club entier (teamId null).
// memberId 42 = Marc, Player de l'équipe 5 — aucun droit sur external_team.
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
const createHandler = ExternalTeamsController.prototype.create;
const findAllHandler = ExternalTeamsController.prototype.findAll;
const updateHandler = ExternalTeamsController.prototype.update;
const removeHandler = ExternalTeamsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module ExternalTeam — scénario multi-rôles (ExternalTeamsController)', () => {
  let guard: PermissionsGuard;

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
  });

  it('AdminClub gère les équipes adverses de son club sans transmettre ?teamId=', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
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

  it('Coach gère les équipes adverses en transmettant son équipe en query (?teamId=)', async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).resolves.toBe(true);
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

  it("Player n'a aucun droit sur external_team, même avec ?teamId=", async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, createHandler)),
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
