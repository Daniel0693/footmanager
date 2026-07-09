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
import { EvaluationConfigController } from './evaluation-config.controller';

/**
 * Scénario multi-rôles : cette route ne porte pas de `:teamId` dans l'URL
 * (voir le commentaire sur EvaluationConfigController) — un Coach ou un
 * Player (rôles scopés TEAM sur `evaluation_config`) doivent transmettre
 * `?teamId=` pour que PermissionsGuard résolve leur scope (docs/modules/
 * auth-roles.md §"Patterns découverts") ; un AdminClub (scope CLUB) n'en a
 * pas besoin.
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

const playerMember: Member = {
  id: 55,
  userId: 12,
  clubId: 1,
  firstName: 'Léo',
  lastName: 'Joueur',
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
  evalConfigReadTeam: {
    id: 1,
    resource: 'evaluation_config',
    action: 'READ',
    scope: 'TEAM',
  },
  evalConfigReadClub: {
    id: 2,
    resource: 'evaluation_config',
    action: 'READ',
    scope: 'CLUB',
  },
};

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.evalConfigReadTeam }],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.evalConfigReadTeam }],
  },
  adminClub: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.evalConfigReadClub }],
  },
};

// memberId 42 = Marc, Coach de l'U15 (teamId=5) uniquement.
// memberId 55 = Léo, Player de la même équipe (teamId=5).
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
  55: [
    {
      memberId: 55,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.player,
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
const findAllHandler = EvaluationConfigController.prototype.findAll;

describe('Module Effectif — scénario multi-rôles (EvaluationConfigController)', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '7:1': coachMember,
      '12:1': playerMember,
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

  it("l'AdminClub (scope CLUB) est autorisé sans `?teamId=`", async () => {
    const request = {
      params: { clubId: '1' },
      query: {},
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));

    expect(request.permissionScope).toBe('CLUB');
  });

  it('le Coach (scope TEAM) est refusé sans `?teamId=` (aucun contexte équipe résolvable)', async () => {
    const request = {
      params: { clubId: '1' },
      query: {},
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('le Coach est autorisé en transmettant `?teamId=` de sa propre équipe', async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));

    expect(request.permissionScope).toBe('TEAM');
  });

  it('le Player est autorisé en transmettant `?teamId=` de sa propre équipe (même permission que le Coach)', async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 12 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));

    expect(request.permissionScope).toBe('TEAM');
  });

  it("le Coach n'a aucun accès via l'équipe d'un autre Coach", async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '6' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
