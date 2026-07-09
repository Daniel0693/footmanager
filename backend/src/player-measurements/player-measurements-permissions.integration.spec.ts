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
import { PlayerMeasurementsController } from './player-measurements.controller';
import { PlayerMeasurementsService } from './player-measurements.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md) appliqué à
 * l'étape A7.1 (Mesures) : un AdminClub voit toutes les mesures de son club,
 * un Coach ne peut lire les mesures de ses équipes qu'en transmettant
 * `teamId` en query (même limitation que player_profile/member — la route ne
 * porte pas de teamId dans l'URL), un Player ne voit que ses propres mesures,
 * un membre sans rôle n'a aucun accès.
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
    resource: 'player_measurement',
    action: 'READ',
    scope: 'CLUB',
  },
  readOwn: {
    id: 2,
    resource: 'player_measurement',
    action: 'READ',
    scope: 'OWN',
  },
  readTeam: {
    id: 3,
    resource: 'player_measurement',
    action: 'READ',
    scope: 'TEAM',
  },
} as const;

const roles = {
  adminClub: {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readClub }],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readOwn }],
  },
  coach: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.readTeam }],
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

// Référence pure à la méthode du controller, utilisée uniquement comme cible
// de métadonnées (Reflector.get lit les décorateurs posés dessus) — jamais
// invoquée, donc aucun risque de perte de binding `this`.
// eslint-disable-next-line @typescript-eslint/unbound-method
const findAllHandler = PlayerMeasurementsController.prototype.findAll;

describe('Module Effectif — scénario multi-rôles (PlayerMeasurementsController)', () => {
  let guard: PermissionsGuard;
  let measurementsService: PlayerMeasurementsService;
  let playerFindFirst: jest.Mock;
  let measurementFindMany: jest.Mock;
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
    measurementFindMany = jest.fn().mockResolvedValue([]);
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerMeasurement: { findMany: measurementFindMany },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    measurementsService = new PlayerMeasurementsService(prismaStub);
  });

  it('AdminClub consulte les mesures de n’importe quel joueur de son club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');

    await expect(
      measurementsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach sans teamId ne peut pas consulter les mesures — l'URL ne porte pas de teamId", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach peut consulter les mesures d’un joueur de son équipe en transmettant teamId en query', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    playerTeamFindFirst.mockResolvedValue({ id: 1, playerId: 100, teamId: 8 });
    await expect(
      measurementsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).resolves.toEqual([]);
  });

  it("Coach ne peut PAS consulter les mesures d'un joueur d'une AUTRE équipe, même en transmettant sa propre équipe en query (faille trouvée en concevant A7.3)", async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    // Le joueur 100 n'a aucune affectation active dans l'équipe 8.
    playerTeamFindFirst.mockResolvedValue(null);
    await expect(
      measurementsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
        teamId: 8,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (Marc, scope OWN) consulte ses propres mesures (teamId en query, même limitation que Coach)', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    await expect(
      measurementsService.findAllByPlayer(1, 100, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).resolves.toEqual([]);
  });

  it("Player (Marc, scope OWN) ne peut pas consulter les mesures d'un autre joueur", async () => {
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
      measurementsService.findAllByPlayer(1, 200, {
        memberId: request.member!.id,
        scope: request.permissionScope!,
      }),
    ).rejects.toBeInstanceOf(AppException);
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
