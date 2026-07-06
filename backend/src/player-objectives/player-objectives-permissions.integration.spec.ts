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
import { PlayerObjectivesController } from './player-objectives.controller';
import { PlayerObjectivesService } from './player-objectives.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'étape A7.4 (Objectifs) : un AdminClub gère les objectifs de n'importe
 * quel joueur de son club, un Coach ne peut agir que sur les objectifs des
 * joueurs de ses équipes (vérifié via `assertPlayerInTeam`), un Player ne
 * peut lire que ses propres objectifs et jamais ceux marqués PRIVE, un
 * membre sans rôle n'a aucun accès.
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

const permissions = {
  readClub: {
    id: 1,
    resource: 'player_objective',
    action: 'READ',
    scope: 'CLUB',
  },
  createClub: {
    id: 2,
    resource: 'player_objective',
    action: 'CREATE',
    scope: 'CLUB',
  },
  updateClub: {
    id: 3,
    resource: 'player_objective',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  deleteClub: {
    id: 4,
    resource: 'player_objective',
    action: 'DELETE',
    scope: 'CLUB',
  },
  readOwn: {
    id: 5,
    resource: 'player_objective',
    action: 'READ',
    scope: 'OWN',
  },
  readTeam: {
    id: 6,
    resource: 'player_objective',
    action: 'READ',
    scope: 'TEAM',
  },
  createTeam: {
    id: 7,
    resource: 'player_objective',
    action: 'CREATE',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 8,
    resource: 'player_objective',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  deleteTeam: {
    id: 9,
    resource: 'player_objective',
    action: 'DELETE',
    scope: 'TEAM',
  },
} as const;

const roles = {
  adminClub: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.readClub },
      { permission: permissions.createClub },
      { permission: permissions.updateClub },
      { permission: permissions.deleteClub },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readOwn }],
  },
  coach: {
    id: 3,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.readTeam },
      { permission: permissions.createTeam },
      { permission: permissions.updateTeam },
      { permission: permissions.deleteTeam },
    ],
  },
};

// memberId 99 = AdminClub du club 1 (scope club entier, teamId null).
// memberId 43 = Daniel, Coach de l'équipe 8 du club 1 (scope TEAM).
// memberId 42 = Marc, Player du club 1 (scope OWN), profil joueur 100.
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
// cibles de métadonnées (Reflector.get lit les décorateurs posés dessus) —
// jamais invoquées, donc aucun risque de perte de binding `this`.
/* eslint-disable @typescript-eslint/unbound-method */
const findAllHandler = PlayerObjectivesController.prototype.findAll;
const createHandler = PlayerObjectivesController.prototype.create;
const updateHandler = PlayerObjectivesController.prototype.update;
const removeHandler = PlayerObjectivesController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Effectif — scénario multi-rôles (PlayerObjectivesController)', () => {
  let guard: PermissionsGuard;
  let objectivesService: PlayerObjectivesService;
  let playerFindFirst: jest.Mock;
  let objectiveFindMany: jest.Mock;
  let objectiveCreate: jest.Mock;
  let objectiveFindFirst: jest.Mock;
  let objectiveUpdate: jest.Mock;
  let objectiveDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());

    const membersByUserAndClub: Record<string, Member> = {
      '70:1': adminClubMember,
      '71:1': coachMember,
      '7:1': marcMember,
      '500:1': noRoleMember,
    };
    const findByUserAndClub = jest.fn((userId: number, clubId: number) =>
      Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
    );
    const membersService = { findByUserAndClub } as unknown as MembersService;

    guard = new PermissionsGuard(
      new Reflector(),
      permissionsService,
      membersService,
    );

    playerFindFirst = jest.fn().mockResolvedValue(marcProfile);
    objectiveFindMany = jest.fn().mockResolvedValue([]);
    objectiveCreate = jest.fn().mockResolvedValue({ id: 1 });
    objectiveFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 100 });
    objectiveUpdate = jest.fn().mockResolvedValue({ id: 1 });
    objectiveDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerObjective: {
        findMany: objectiveFindMany,
        create: objectiveCreate,
        findFirst: objectiveFindFirst,
        update: objectiveUpdate,
        delete: objectiveDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    objectivesService = new PlayerObjectivesService(prismaStub);
  });

  it('AdminClub consulte les objectifs de n’importe quel joueur de son club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      objectivesService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach sans teamId ne peut pas consulter les objectifs — l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach peut consulter/créer des objectifs pour un joueur de son équipe en transmettant teamId en query', async () => {
    const findRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(findRequest, findAllHandler));
    await expect(
      objectivesService.findAllByPlayer(1, 100, {
        memberId: findRequest.member!.id,
        scope: findRequest.permissionScope!,
        teamId: 8,
      }),
    ).resolves.toEqual([]);

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(createRequest, createHandler));

    let createdAssignedById: number | undefined;
    objectiveCreate.mockImplementation(
      ({ data }: { data: { assignedById: number } }) => {
        createdAssignedById = data.assignedById;
        return Promise.resolve({ id: 1 });
      },
    );
    await objectivesService.create(
      1,
      100,
      createRequest.member!.id,
      { theme: 'TACTIQUE', description: 'Résumé', horizon: 'SHORT_TERM' },
      {
        memberId: createRequest.member!.id,
        scope: createRequest.permissionScope!,
        teamId: 8,
      },
    );
    expect(createdAssignedById).toBe(coachMember.id);
  });

  it("Coach ne peut PAS agir sur les objectifs d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    playerTeamFindFirst.mockResolvedValue(null);
    await expect(
      objectivesService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveFindMany).not.toHaveBeenCalled();
  });

  it('Coach peut modifier et supprimer un objectif en transmettant teamId en query', async () => {
    const updateRequest = {
      params: { clubId: '1', playerId: '100', id: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(updateRequest, updateHandler));

    const removeRequest = {
      params: { clubId: '1', playerId: '100', id: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(removeRequest, removeHandler));

    await objectivesService.update(
      1,
      100,
      1,
      { status: 'ACHIEVED' },
      {
        memberId: updateRequest.member!.id,
        scope: updateRequest.permissionScope!,
        teamId: 8,
      },
    );
    await objectivesService.remove(1, 100, 1, {
      memberId: removeRequest.member!.id,
      scope: removeRequest.permissionScope!,
      teamId: 8,
    });
    expect(objectiveUpdate).toHaveBeenCalled();
    expect(objectiveDelete).toHaveBeenCalled();
  });

  it('Player (Marc, scope OWN) consulte ses propres objectifs mais jamais les objectifs PRIVE', async () => {
    objectiveFindMany.mockResolvedValue([
      {
        id: 1,
        playerId: 100,
        visibility: 'PRIVE',
        description: 'Objectif privé du staff',
      },
      {
        id: 2,
        playerId: 100,
        visibility: 'SEMI_PRIVE',
        description: 'Objectif visible du joueur',
      },
    ]);
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    const result = await objectivesService.findAllByPlayer(1, 100, {
      memberId: request.member!.id,
      scope: request.permissionScope!,
    });
    expect(result).toEqual([
      {
        id: 2,
        playerId: 100,
        visibility: 'SEMI_PRIVE',
        description: 'Objectif visible du joueur',
      },
    ]);
  });

  it("Player (Marc, scope OWN) ne peut pas consulter les objectifs d'un autre joueur", async () => {
    const request = {
      params: { clubId: '1', playerId: '200' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));

    playerFindFirst.mockResolvedValue({
      ...marcProfile,
      id: 200,
      memberId: 55,
    });
    await expect(
      objectivesService.findAllByPlayer(1, 200, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (Marc, scope OWN) n'a pas le droit de créer un objectif", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveCreate).not.toHaveBeenCalled();
  });

  it("un membre du club sans aucun rôle n'a aucun accès", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 500 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
