import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué au
 * module Effectif : un AdminClub voit tout l'effectif de son club (et aucun
 * autre club), un Player ne voit que son propre profil, un membre sans rôle
 * n'a aucun accès. Exerce PermissionsGuard + PermissionsService (réels) +
 * PlayersService (réel) ensemble plutôt que des mocks isolés.
 */

const adminClubMember: Member = {
  id: 99,
  userId: 70,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Admin',
  phone: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const marcMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
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
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const marcProfile: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const otherProfile: PlayerProfile = {
  id: 200,
  memberId: 55,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
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
  playerProfileReadOwn: {
    id: 2,
    resource: 'player_profile',
    action: 'READ',
    scope: 'OWN',
  },
} as const;

const roles = {
  adminClub: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadClub }],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.playerProfileReadOwn }],
  },
};

// memberId 99 = AdminClub du club 1 (scope club entier, teamId null).
// memberId 42 = Marc, Player du club 1 (scope OWN).
// memberId 1000 = membre du club 1 sans aucun rôle.
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

// Références pures aux méthodes du controller, utilisées uniquement comme
// cible de métadonnées (Reflector.get lit les décorateurs posés dessus) —
// jamais invoquées, donc aucun risque de perte de binding `this`.
// eslint-disable-next-line @typescript-eslint/unbound-method
const findAllHandler = PlayersController.prototype.findAll;
// eslint-disable-next-line @typescript-eslint/unbound-method
const findOneHandler = PlayersController.prototype.findOne;

describe('Module Effectif — scénario multi-rôles (PlayersController)', () => {
  let guard: PermissionsGuard;
  let playersService: PlayersService;
  let profileFindFirst: jest.Mock;
  let profileFindMany: jest.Mock;
  let profileFindUnique: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let membersByUserAndClub: Record<string, Member>;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    membersByUserAndClub = {
      '70:1': adminClubMember,
      '7:1': marcMember,
      '500:1': noRoleMember,
    };
    findByUserAndClub = jest.fn((userId: number, clubId: number) =>
      Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
    );
    const membersService = {
      findByUserAndClub,
    } as unknown as MembersService;

    guard = new PermissionsGuard(
      new Reflector(),
      permissionsService,
      membersService,
    );

    profileFindFirst = jest.fn();
    profileFindMany = jest.fn();
    profileFindUnique = jest.fn();
    const prismaStub = {
      playerProfile: {
        findFirst: profileFindFirst,
        findMany: profileFindMany,
        findUnique: profileFindUnique,
      },
    } as unknown as PrismaService;
    playersService = new PlayersService(prismaStub, membersService);
  });

  it('AdminClub voit tout l’effectif de son club', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('CLUB');

    profileFindMany.mockResolvedValue([marcProfile, otherProfile]);
    const result = await playersService.findAllByClub(1, {
      memberId: request.member!.id,
      scope: request.permissionScope!,
    });

    expect(result).toEqual([marcProfile, otherProfile]);
  });

  it("AdminClub du club 1 n'a aucun accès au club 2 (pas de fuite inter-club)", async () => {
    const request = {
      params: { clubId: '2' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (Marc) accède à son profil via /me, jamais via la liste ou l'id générique", async () => {
    // Le rôle Player de Marc est scopé à son équipe (teamId=8,
    // docs/schema/fondations.md), et les routes /players et /players/:id ne
    // portent pas de teamId dans l'URL : matchesContext ne peut jamais faire
    // correspondre son MemberRole, donc le guard le refuse entièrement — ce
    // qui est le comportement voulu (voir décision du 2026-07-03, étape A2).
    const listRequest = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(listRequest, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);

    const readByIdRequest = {
      params: { clubId: '1', id: '100' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readByIdRequest, findOneHandler)),
    ).rejects.toBeInstanceOf(AppException);

    // /me contourne volontairement le guard granulaire (résolution
    // d'identité pure) : Marc obtient son propre profil sans jamais pouvoir
    // demander celui d'un autre, puisque la route ne prend pas d'id.
    profileFindUnique.mockResolvedValue(marcProfile);
    await expect(playersService.findMe(1, 7)).resolves.toBe(marcProfile);
    expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
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
