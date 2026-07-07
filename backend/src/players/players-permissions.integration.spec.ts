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
  gender: null,
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
  gender: null,
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
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const otherProfile: PlayerProfile = {
  id: 200,
  memberId: 55,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
  preferredFoot: null,
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
  playerProfileReadTeam: {
    id: 3,
    resource: 'player_profile',
    action: 'READ',
    scope: 'TEAM',
  },
  playerProfileCreateTeam: {
    id: 4,
    resource: 'player_profile',
    action: 'CREATE',
    scope: 'TEAM',
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
  coach: {
    id: 3,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.playerProfileReadTeam },
      { permission: permissions.playerProfileCreateTeam },
    ],
  },
};

// memberId 99 = AdminClub du club 1 (scope club entier, teamId null).
// memberId 42 = Marc, Player du club 1 (scope OWN).
// memberId 43 = Daniel, Coach de l'équipe 8 du club 1 (scope TEAM).
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
// eslint-disable-next-line @typescript-eslint/unbound-method
const createHandler = PlayersController.prototype.create;

describe('Module Effectif — scénario multi-rôles (PlayersController)', () => {
  let guard: PermissionsGuard;
  let playersService: PlayersService;
  let profileFindFirst: jest.Mock;
  let profileFindMany: jest.Mock;
  let profileFindUnique: jest.Mock;
  let profileCreate: jest.Mock;
  let memberFindUnique: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let membersByUserAndClub: Record<string, Member>;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    membersByUserAndClub = {
      '70:1': adminClubMember,
      '7:1': marcMember,
      '71:1': coachMember,
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
    profileCreate = jest.fn().mockResolvedValue({ id: 1 });
    memberFindUnique = jest.fn().mockResolvedValue(coachMember);
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: {
        findFirst: profileFindFirst,
        findMany: profileFindMany,
        findUnique: profileFindUnique,
        create: profileCreate,
      },
      member: { findUnique: memberFindUnique },
      playerTeam: { findFirst: playerTeamFindFirst },
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

  it("Coach (scope TEAM) sans teamId ne peut pas ouvrir la fiche d'un joueur — bug réel trouvé en test manuel (Daniel/Tom)", async () => {
    const request = {
      params: { clubId: '1', id: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findOneHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach peut ouvrir la fiche d’un joueur de son équipe en transmettant teamId en query', async () => {
    const request = {
      params: { clubId: '1', id: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findOneHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    profileFindFirst.mockResolvedValue(marcProfile);
    playerTeamFindFirst.mockResolvedValue({ id: 1, playerId: 100, teamId: 8 });
    await expect(
      playersService.findOne(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).resolves.toBe(marcProfile);
  });

  it("Coach ne peut PAS ouvrir la fiche d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query (faille trouvée en concevant A7.3)", async () => {
    // Le guard ne vérifie que "Daniel a-t-il un rôle sur l'équipe 8 ?" — pas
    // que le joueur 100 appartient à l'équipe 8. Avant le correctif,
    // PlayersService.findOne ne vérifiait pas non plus cette appartenance :
    // Daniel pouvait consulter n'importe quel joueur du club en transmettant
    // sa propre équipe. Voir docs/modules/auth-roles.md §Patterns découverts.
    const request = {
      params: { clubId: '1', id: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findOneHandler));
    expect(request.permissionScope).toBe('TEAM');

    // Le joueur 100 n'a aucune affectation active dans l'équipe 8 (il est
    // dans une autre équipe du même club).
    profileFindFirst.mockResolvedValue(marcProfile);
    playerTeamFindFirst.mockResolvedValue(null);

    await expect(
      playersService.findOne(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Coach sans teamId ne peut pas créer de profil joueur : l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('Coach peut créer un profil joueur dans son équipe en transmettant teamId en query — bug réel trouvé en test manuel (bouton "Ajouter un joueur")', async () => {
    const request = {
      params: { clubId: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(
      playersService.create(1, {
        memberId: 43,
        licenseNumber: undefined,
        nationality: undefined,
        birthDate: undefined,
        preferredFoot: undefined,
      }),
    ).resolves.toEqual({ id: 1 });
    expect(profileCreate).toHaveBeenCalled();
  });
});
