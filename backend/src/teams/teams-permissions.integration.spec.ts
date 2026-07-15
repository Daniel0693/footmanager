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
import { TeamsController } from './teams.controller';

/**
 * Scénario multi-rôles : `findAll` (liste de toutes les équipes du club) et
 * `findOne` (détail d'une équipe) n'ont pas de `:teamId` dans leur URL — la
 * ressource elle-même EST l'équipe, identifiée par `:id`. Un Coach (rôle
 * scopé TEAM sur `team`) ne peut donc jamais matcher `findAll` (aucun
 * contexte équipe résolvable, voir docs/modules/auth-roles.md §"Patterns
 * découverts" — c'est exactement pour ça que `GET .../teams/mine` existe,
 * TeamsService.findMineInClub) ; pour `findOne`, il doit transmettre
 * `?teamId=` égal à `:id` pour que PermissionsGuard résolve son scope.
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

const permissions = {
  teamReadTeam: { id: 1, resource: 'team', action: 'READ', scope: 'TEAM' },
  teamReadClub: { id: 2, resource: 'team', action: 'READ', scope: 'CLUB' },
  teamUpdateClub: {
    id: 3,
    resource: 'team',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  teamDeleteClub: {
    id: 4,
    resource: 'team',
    action: 'DELETE',
    scope: 'CLUB',
  },
};

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.teamReadTeam }],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.teamReadClub },
      { permission: permissions.teamUpdateClub },
      { permission: permissions.teamDeleteClub },
    ],
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
const findAllHandler = TeamsController.prototype.findAll;
// eslint-disable-next-line @typescript-eslint/unbound-method
const findOneHandler = TeamsController.prototype.findOne;
// eslint-disable-next-line @typescript-eslint/unbound-method
const updateHandler = TeamsController.prototype.update;
// eslint-disable-next-line @typescript-eslint/unbound-method
const removeHandler = TeamsController.prototype.remove;

describe('Module Effectif — scénario multi-rôles (TeamsController)', () => {
  let guard: PermissionsGuard;

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
  });

  it("l'AdminClub (scope CLUB) liste toutes les équipes du club sans `?teamId=`", async () => {
    const request = {
      params: { clubId: '1' },
      query: {},
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));

    expect(request.permissionScope).toBe('CLUB');
  });

  it('le Coach (scope TEAM) est refusé sur la liste de toutes les équipes (aucun contexte équipe résolvable, voir /mine)', async () => {
    const request = {
      params: { clubId: '1' },
      query: {},
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('le Coach est refusé sur le détail de sa propre équipe sans `?teamId=`', async () => {
    const request = {
      params: { clubId: '1', id: '5' },
      query: {},
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findOneHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('le Coach est autorisé sur le détail de sa propre équipe en transmettant `?teamId=` égal à `:id`', async () => {
    const request = {
      params: { clubId: '1', id: '5' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findOneHandler));

    expect(request.permissionScope).toBe('TEAM');
  });

  it("l'AdminClub (scope CLUB) modifie et supprime une équipe du club (B18, boutons Modifier/Supprimer)", async () => {
    const updateRequest = {
      params: { clubId: '1', id: '5' },
      query: {},
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(updateRequest, updateHandler));
    expect(updateRequest.permissionScope).toBe('CLUB');

    const removeRequest = {
      params: { clubId: '1', id: '5' },
      query: {},
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(removeRequest, removeHandler));
    expect(removeRequest.permissionScope).toBe('CLUB');
  });

  it("le Coach n'a pas la permission de modifier ou supprimer une équipe, même la sienne (gestion réservée à AdminClub+)", async () => {
    const request = {
      params: { clubId: '1', id: '5' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
