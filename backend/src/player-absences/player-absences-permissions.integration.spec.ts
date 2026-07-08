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
import { PlayerAbsencesController } from './player-absences.controller';
import { PlayerAbsencesService } from './player-absences.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'étape B8 (Absences) : un AdminClub gère les absences de n'importe quel
 * joueur de son club, un Coach ne peut agir que sur les absences des joueurs
 * de ses équipes (vérifié via `assertPlayerInTeam`), un Player ne peut lire
 * que ses propres absences, un membre sans rôle n'a aucun accès.
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
    resource: 'player_absence',
    action: 'READ',
    scope: 'CLUB',
  },
  createClub: {
    id: 2,
    resource: 'player_absence',
    action: 'CREATE',
    scope: 'CLUB',
  },
  updateClub: {
    id: 3,
    resource: 'player_absence',
    action: 'UPDATE',
    scope: 'CLUB',
  },
  deleteClub: {
    id: 4,
    resource: 'player_absence',
    action: 'DELETE',
    scope: 'CLUB',
  },
  readOwn: {
    id: 5,
    resource: 'player_absence',
    action: 'READ',
    scope: 'OWN',
  },
  readTeam: {
    id: 6,
    resource: 'player_absence',
    action: 'READ',
    scope: 'TEAM',
  },
  createTeam: {
    id: 7,
    resource: 'player_absence',
    action: 'CREATE',
    scope: 'TEAM',
  },
  updateTeam: {
    id: 8,
    resource: 'player_absence',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  deleteTeam: {
    id: 9,
    resource: 'player_absence',
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
const findAllHandler = PlayerAbsencesController.prototype.findAll;
const createHandler = PlayerAbsencesController.prototype.create;
const updateHandler = PlayerAbsencesController.prototype.update;
const removeHandler = PlayerAbsencesController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Calendrier — scénario multi-rôles (PlayerAbsencesController)', () => {
  let guard: PermissionsGuard;
  let absencesService: PlayerAbsencesService;
  let playerFindFirst: jest.Mock;
  let absenceFindMany: jest.Mock;
  let absenceCreate: jest.Mock;
  let absenceFindFirst: jest.Mock;
  let absenceUpdate: jest.Mock;
  let absenceDelete: jest.Mock;
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
    absenceFindMany = jest.fn().mockResolvedValue([]);
    absenceCreate = jest.fn().mockResolvedValue({ id: 1 });
    absenceFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 100 });
    absenceUpdate = jest.fn().mockResolvedValue({ id: 1 });
    absenceDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerAbsence: {
        findMany: absenceFindMany,
        create: absenceCreate,
        findFirst: absenceFindFirst,
        update: absenceUpdate,
        delete: absenceDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    absencesService = new PlayerAbsencesService(
      prismaStub,
      membersService,
      permissionsService,
    );
  });

  it('AdminClub consulte les absences de n’importe quel joueur de son club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      absencesService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach sans teamId ne peut pas consulter les absences — l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach peut consulter/créer des absences pour un joueur de son équipe en transmettant teamId en query', async () => {
    const findRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(findRequest, findAllHandler));
    await expect(
      absencesService.findAllByPlayer(1, 100, {
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

    let createdReportedById: number | undefined;
    absenceCreate.mockImplementation(
      ({ data }: { data: { reportedById: number } }) => {
        createdReportedById = data.reportedById;
        return Promise.resolve({ id: 1 });
      },
    );
    await absencesService.create(
      1,
      100,
      createRequest.member!.id,
      {
        reason: 'Blessure',
        startDate: new Date('2026-07-10'),
        endDate: new Date('2026-07-20'),
      },
      {
        memberId: createRequest.member!.id,
        scope: createRequest.permissionScope!,
        teamId: 8,
      },
    );
    expect(createdReportedById).toBe(coachMember.id);
  });

  it("Coach ne peut PAS agir sur les absences d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    playerTeamFindFirst.mockResolvedValue(null);
    await expect(
      absencesService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(absenceFindMany).not.toHaveBeenCalled();
  });

  it('Coach peut modifier et supprimer une absence en transmettant teamId en query', async () => {
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

    await absencesService.update(
      1,
      100,
      1,
      { isExcused: true },
      {
        memberId: updateRequest.member!.id,
        scope: updateRequest.permissionScope!,
        teamId: 8,
      },
    );
    await absencesService.remove(1, 100, 1, {
      memberId: removeRequest.member!.id,
      scope: removeRequest.permissionScope!,
      teamId: 8,
    });
    expect(absenceUpdate).toHaveBeenCalled();
    expect(absenceDelete).toHaveBeenCalled();
  });

  it('Player (Marc, scope OWN) consulte ses propres absences', async () => {
    absenceFindMany.mockResolvedValue([
      { id: 1, playerId: 100, reason: 'Blessure au genou' },
    ]);
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    const result = await absencesService.findAllByPlayer(1, 100, {
      memberId: request.member!.id,
      scope: request.permissionScope!,
    });
    expect(result).toEqual([
      { id: 1, playerId: 100, reason: 'Blessure au genou' },
    ]);
  });

  it("Player (Marc, scope OWN) ne peut pas consulter les absences d'un autre joueur", async () => {
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
      absencesService.findAllByPlayer(1, 200, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (Marc, scope OWN) n'a pas le droit de créer une absence", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(absenceCreate).not.toHaveBeenCalled();
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
