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
import { PlayerInterviewsController } from './player-interviews.controller';
import { PlayerInterviewsService } from './player-interviews.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'étape A7.2 (Entretien) : un AdminClub gère les entretiens de n'importe
 * quel joueur de son club, un Coach ne peut agir sur les entretiens de ses
 * équipes qu'en transmettant `teamId` en query (même limitation que
 * player_measurement — la route ne porte pas de teamId dans l'URL), un
 * Player ne peut lire que ses propres entretiens (pas de CREATE/UPDATE/
 * DELETE), un membre sans rôle n'a aucun accès.
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

const marcMember: Member = {
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

const marcProfile: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const permissions = {
  readClub: {
    id: 1,
    resource: 'player_interview',
    action: 'READ',
    scope: 'CLUB',
  },
  createClub: {
    id: 2,
    resource: 'player_interview',
    action: 'CREATE',
    scope: 'CLUB',
  },
  updateClub: {
    id: 3,
    resource: 'player_interview',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  deleteClub: {
    id: 4,
    resource: 'player_interview',
    action: 'DELETE',
    scope: 'CLUB',
  },
  readOwn: {
    id: 5,
    resource: 'player_interview',
    action: 'READ',
    scope: 'OWN',
  },
  readTeam: {
    id: 6,
    resource: 'player_interview',
    action: 'READ',
    scope: 'TEAM',
  },
  createTeam: {
    id: 7,
    resource: 'player_interview',
    action: 'CREATE',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 8,
    resource: 'player_interview',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  deleteTeam: {
    id: 9,
    resource: 'player_interview',
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
const findAllHandler = PlayerInterviewsController.prototype.findAll;
const createHandler = PlayerInterviewsController.prototype.create;
const updateHandler = PlayerInterviewsController.prototype.update;
const removeHandler = PlayerInterviewsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Effectif — scénario multi-rôles (PlayerInterviewsController)', () => {
  let guard: PermissionsGuard;
  let interviewsService: PlayerInterviewsService;
  let playerFindFirst: jest.Mock;
  let interviewFindMany: jest.Mock;
  let interviewCreate: jest.Mock;
  let interviewFindFirst: jest.Mock;
  let interviewUpdate: jest.Mock;
  let interviewDelete: jest.Mock;
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
    interviewFindMany = jest.fn().mockResolvedValue([]);
    interviewCreate = jest.fn().mockResolvedValue({ id: 1 });
    interviewFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 100 });
    interviewUpdate = jest.fn().mockResolvedValue({ id: 1 });
    interviewDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerInterview: {
        findMany: interviewFindMany,
        create: interviewCreate,
        findFirst: interviewFindFirst,
        update: interviewUpdate,
        delete: interviewDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    interviewsService = new PlayerInterviewsService(prismaStub);
  });

  it('AdminClub consulte les entretiens de n’importe quel joueur de son club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      interviewsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach sans teamId ne peut pas consulter les entretiens — l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Coach ne peut PAS consulter les entretiens d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query (faille A7.3)", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    playerTeamFindFirst.mockResolvedValue(null);
    await expect(
      interviewsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewFindMany).not.toHaveBeenCalled();
  });

  it('Coach peut créer un entretien en transmettant teamId en query, staffId auto-assigné', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    let createdStaffId: number | undefined;
    interviewCreate.mockImplementation(
      ({ data }: { data: { staffId: number } }) => {
        createdStaffId = data.staffId;
        return Promise.resolve({ id: 1 });
      },
    );

    await interviewsService.create(
      1,
      100,
      request.member!.id,
      {
        date: new Date('2026-01-15'),
        subject: 'Bilan',
        summary: 'Résumé',
        staffFeedback: 'Feedback',
      },
      {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      },
    );
    expect(createdStaffId).toBe(coachMember.id);
  });

  it("Coach ne peut PAS créer un entretien pour un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query (faille A7.3)", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, createHandler));
    playerTeamFindFirst.mockResolvedValue(null);

    await expect(
      interviewsService.create(
        1,
        100,
        request.member!.id,
        {
          date: new Date('2026-01-15'),
          subject: 'Bilan',
          summary: 'Résumé',
        },
        {
          memberId: request.member!.id,
          scope: request.permissionScope!,
          teamId: 8,
        },
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewCreate).not.toHaveBeenCalled();
  });

  it('Coach peut modifier et supprimer un entretien en transmettant teamId en query', async () => {
    const updateRequest = {
      params: { clubId: '1', playerId: '100', id: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(updateRequest, updateHandler)),
    ).resolves.toBe(true);

    const removeRequest = {
      params: { clubId: '1', playerId: '100', id: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(removeRequest, removeHandler)),
    ).resolves.toBe(true);

    await interviewsService.update(
      1,
      100,
      1,
      { subject: 'Nouveau' },
      {
        memberId: updateRequest.member!.id,
        scope: updateRequest.permissionScope!,
        teamId: 8,
      },
    );
    await interviewsService.remove(1, 100, 1, {
      memberId: removeRequest.member!.id,
      scope: removeRequest.permissionScope!,
      teamId: 8,
    });
    expect(interviewUpdate).toHaveBeenCalled();
    expect(interviewDelete).toHaveBeenCalled();
  });

  it("Coach ne peut PAS modifier/supprimer un entretien d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query (faille A7.3)", async () => {
    const updateRequest = {
      params: { clubId: '1', playerId: '100', id: '1' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(updateRequest, updateHandler));
    playerTeamFindFirst.mockResolvedValue(null);

    await expect(
      interviewsService.update(
        1,
        100,
        1,
        { subject: 'Nouveau' },
        {
          memberId: updateRequest.member!.id,
          scope: updateRequest.permissionScope!,
          teamId: 8,
        },
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewUpdate).not.toHaveBeenCalled();

    await expect(
      interviewsService.remove(1, 100, 1, {
        memberId: updateRequest.member!.id,
        scope: updateRequest.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewDelete).not.toHaveBeenCalled();
  });

  it('Player (Marc, scope OWN) consulte ses propres entretiens (teamId en query, même limitation que Coach)', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    await expect(
      interviewsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Player (Marc, scope OWN) ne peut pas consulter les entretiens d'un autre joueur", async () => {
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
      interviewsService.findAllByPlayer(1, 200, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (Marc, scope OWN) n'a pas le droit de créer un entretien", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewCreate).not.toHaveBeenCalled();
  });

  it('Player (Marc, scope OWN) ne reçoit jamais staffAssessment, contrairement au Coach (scope TEAM)', async () => {
    interviewFindMany.mockResolvedValue([
      {
        id: 1,
        playerId: 100,
        staffFeedback: 'Conclusions transmises',
        staffAssessment: 'Ressenti privé de l’encadrant',
        playerFeedback: 'Retour du joueur',
      },
    ]);

    const playerRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(playerRequest, findAllHandler));
    const [playerResult] = await interviewsService.findAllByPlayer(1, 100, {
      memberId: playerRequest.member!.id,
      scope: playerRequest.permissionScope!,
    });
    expect(playerResult).not.toHaveProperty('staffAssessment');
    expect(playerResult.staffFeedback).toBe('Conclusions transmises');
    expect(playerResult.playerFeedback).toBe('Retour du joueur');

    const coachRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(coachRequest, findAllHandler));
    const [coachResult] = await interviewsService.findAllByPlayer(1, 100, {
      memberId: coachRequest.member!.id,
      scope: coachRequest.permissionScope!,
      teamId: 8,
    });
    expect((coachResult as { staffAssessment?: string }).staffAssessment).toBe(
      'Ressenti privé de l’encadrant',
    );
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
