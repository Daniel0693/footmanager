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
import { PlayerEvaluationsController } from './player-evaluations.controller';
import { PlayerEvaluationsService } from './player-evaluations.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'étape A7.5 (Évaluation) : un AdminClub gère les évaluations de n'importe
 * quel joueur de son club, un Coach ne peut agir que sur les évaluations des
 * joueurs de ses équipes (vérifié via `assertPlayerInTeam`), un Player ne
 * peut lire que ses propres évaluations, un membre sans rôle n'a aucun accès.
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
    resource: 'player_evaluation',
    action: 'READ',
    scope: 'CLUB',
  },
  createClub: {
    id: 2,
    resource: 'player_evaluation',
    action: 'CREATE',
    scope: 'CLUB',
  },
  updateClub: {
    id: 3,
    resource: 'player_evaluation',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  deleteClub: {
    id: 4,
    resource: 'player_evaluation',
    action: 'DELETE',
    scope: 'CLUB',
  },
  readOwn: {
    id: 5,
    resource: 'player_evaluation',
    action: 'READ',
    scope: 'OWN',
  },
  readTeam: {
    id: 6,
    resource: 'player_evaluation',
    action: 'READ',
    scope: 'TEAM',
  },
  createTeam: {
    id: 7,
    resource: 'player_evaluation',
    action: 'CREATE',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 8,
    resource: 'player_evaluation',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  deleteTeam: {
    id: 9,
    resource: 'player_evaluation',
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

/* eslint-disable @typescript-eslint/unbound-method */
const findAllHandler = PlayerEvaluationsController.prototype.findAll;
const createHandler = PlayerEvaluationsController.prototype.create;
const updateHandler = PlayerEvaluationsController.prototype.update;
const removeHandler = PlayerEvaluationsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Effectif — scénario multi-rôles (PlayerEvaluationsController)', () => {
  let guard: PermissionsGuard;
  let evaluationsService: PlayerEvaluationsService;
  let playerFindFirst: jest.Mock;
  let criterionFindFirst: jest.Mock;
  let evaluationFindMany: jest.Mock;
  let evaluationCreate: jest.Mock;
  let evaluationFindFirst: jest.Mock;
  let evaluationUpdate: jest.Mock;
  let evaluationDelete: jest.Mock;
  let scoreDeleteMany: jest.Mock;
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
    criterionFindFirst = jest.fn().mockResolvedValue(1);
    evaluationFindMany = jest.fn().mockResolvedValue([]);
    evaluationCreate = jest.fn().mockResolvedValue({ id: 1 });
    evaluationFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 100 });
    evaluationUpdate = jest.fn().mockResolvedValue({ id: 1 });
    evaluationDelete = jest.fn().mockResolvedValue({ id: 1 });
    scoreDeleteMany = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      evaluationCriterion: { count: criterionFindFirst },
      playerEvaluation: {
        findMany: evaluationFindMany,
        create: evaluationCreate,
        findFirst: evaluationFindFirst,
        update: evaluationUpdate,
        delete: evaluationDelete,
      },
      playerEvaluationScore: { deleteMany: scoreDeleteMany },
      playerTeam: { findFirst: playerTeamFindFirst },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;
    evaluationsService = new PlayerEvaluationsService(prismaStub);
  });

  it('AdminClub consulte les évaluations de n’importe quel joueur de son club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      evaluationsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach sans teamId ne peut pas consulter les évaluations — l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach peut consulter/créer des évaluations pour un joueur de son équipe en transmettant teamId en query', async () => {
    const findRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(findRequest, findAllHandler));
    await expect(
      evaluationsService.findAllByPlayer(1, 100, {
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

    let createdEvaluatorId: number | undefined;
    evaluationCreate.mockImplementation(
      ({ data }: { data: { evaluatorId: number } }) => {
        createdEvaluatorId = data.evaluatorId;
        return Promise.resolve({ id: 1 });
      },
    );
    await evaluationsService.create(
      1,
      100,
      createRequest.member!.id,
      { date: new Date('2026-06-01'), scores: [{ criterionId: 5, score: 7 }] },
      {
        memberId: createRequest.member!.id,
        scope: createRequest.permissionScope!,
        teamId: 8,
      },
    );
    expect(createdEvaluatorId).toBe(coachMember.id);
  });

  it("Coach ne peut PAS agir sur les évaluations d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    playerTeamFindFirst.mockResolvedValue(null);
    await expect(
      evaluationsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(evaluationFindMany).not.toHaveBeenCalled();
  });

  it('Coach peut modifier et supprimer une évaluation en transmettant teamId en query', async () => {
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

    await evaluationsService.update(
      1,
      100,
      1,
      { scores: [{ criterionId: 5, score: 9 }] },
      {
        memberId: updateRequest.member!.id,
        scope: updateRequest.permissionScope!,
        teamId: 8,
      },
    );
    await evaluationsService.remove(1, 100, 1, {
      memberId: removeRequest.member!.id,
      scope: removeRequest.permissionScope!,
      teamId: 8,
    });
    expect(evaluationUpdate).toHaveBeenCalled();
    expect(evaluationDelete).toHaveBeenCalled();
  });

  it('Player (Marc, scope OWN) consulte ses propres évaluations', async () => {
    evaluationFindMany.mockResolvedValue([
      { id: 1, playerId: 100, scores: [{ criterionId: 5, score: 7 }] },
    ]);
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    const result = await evaluationsService.findAllByPlayer(1, 100, {
      memberId: request.member!.id,
      scope: request.permissionScope!,
    });
    expect(result).toEqual([
      { id: 1, playerId: 100, scores: [{ criterionId: 5, score: 7 }] },
    ]);
  });

  it("Player (Marc, scope OWN) ne peut pas consulter les évaluations d'un autre joueur", async () => {
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
      evaluationsService.findAllByPlayer(1, 200, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (Marc, scope OWN) n'a pas le droit de créer une évaluation", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(evaluationCreate).not.toHaveBeenCalled();
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
