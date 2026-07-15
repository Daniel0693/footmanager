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
import { ChampionshipsController } from './championships.controller';
import { ChampionshipsService } from './championships.service';
import { ClubChampionshipsController } from './club-championships.controller';
import { SeasonChampionshipsController } from './season-championships.controller';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * Championship (Partie B, B5) : un Coach gère les championnats de ses
 * équipes (scope TEAM CRUD complet — décision B0, contrairement à `season`
 * où ce droit lui a été retiré), un AdminClub gère tout le club (scope
 * CLUB), un Player ne peut que consulter (scope TEAM, READ seul), un membre
 * sans rôle n'a aucun accès. L'URL porte toujours teamId (même pattern que
 * EventsController/TeamStaffController) : pas de contournement `?teamId=`.
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
  championshipCreateTeam: {
    id: 1,
    resource: 'championship',
    action: 'CREATE',
    scope: 'TEAM',
  },
  championshipReadTeam: {
    id: 2,
    resource: 'championship',
    action: 'READ',
    scope: 'TEAM',
  },
  championshipCreateClub: {
    id: 3,
    resource: 'championship',
    action: 'CREATE',
    scope: 'CLUB',
  },
  championshipReadClub: {
    id: 4,
    resource: 'championship',
    action: 'READ',
    scope: 'CLUB',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.championshipCreateTeam },
      { permission: permissions.championshipReadTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.championshipCreateClub },
      { permission: permissions.championshipReadClub },
    ],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.championshipReadTeam }],
  },
};

// memberId 43 = Daniel, Coach de l'équipe 5 (U15) uniquement.
// memberId 99 = AdminClub, scope club entier (teamId null).
// memberId 42 = Marc, Player de l'équipe 5 (scope TEAM, READ seul).
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
const createHandler = ChampionshipsController.prototype.create;
const findAllHandler = ChampionshipsController.prototype.findAll;
const updateHandler = ChampionshipsController.prototype.update;
const removeHandler = ChampionshipsController.prototype.remove;
const getStandingsHandler = ChampionshipsController.prototype.getStandings;
const findAllBySeasonHandler =
  SeasonChampionshipsController.prototype.findAllBySeason;
const findAllByClubHandler =
  ClubChampionshipsController.prototype.findAllByClub;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Module Championship — scénario multi-rôles (ChampionshipsController)', () => {
  let guard: PermissionsGuard;
  let championshipsService: ChampionshipsService;
  let teamFindFirst: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let championshipFindMany: jest.Mock;
  let championshipCreate: jest.Mock;

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

    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    seasonFindFirst = jest.fn().mockResolvedValue({ id: 10, clubId: 1 });
    championshipFindMany = jest.fn().mockResolvedValue([]);
    championshipCreate = jest.fn().mockResolvedValue({ id: 900 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      season: { findFirst: seasonFindFirst },
      championship: {
        findMany: championshipFindMany,
        create: championshipCreate,
      },
      championshipParticipant: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;
    championshipsService = new ChampionshipsService(
      prismaStub,
      permissionsService,
    );
  });

  it('Coach crée un championnat pour sa propre équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await championshipsService.create(1, 5, {
      seasonId: 10,
      name: 'Championnat Automne',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });
    expect(championshipCreate).toHaveBeenCalled();
  });

  it("Coach n'a aucun droit pour créer un championnat sur une AUTRE équipe", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('AdminClub crée un championnat pour n’importe quelle équipe du club', async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Player consulte les championnats de son équipe (READ seul), canManage=false', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(championshipsService.findAllByTeam(1, 5, 42)).resolves.toEqual(
      { data: [], canManage: false, createScope: null, readScope: 'TEAM' },
    );
  });

  it('Player consulte le classement (READ seul, même permission que la liste)', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, getStandingsHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');
  });

  it("Player n'a pas la permission de créer, modifier ou supprimer un championnat", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(championshipCreate).not.toHaveBeenCalled();
  });

  it("un membre du club sans aucun rôle n'a aucun accès", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 500 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});

// ───────────────────────────────────────────────────────────────────────
// SeasonChampionshipsController (B16) — vue cross-équipe "championnats
// d'une saison", sans `?teamId=` : seul un scope CLUB/ALL (AdminClub+)
// satisfait `championship READ` ici, un Coach/Player (scope TEAM) est
// toujours refusé quel que soit son équipe, cette vue n'ayant pas de sens
// pour un rôle limité à sa propre équipe.
// ───────────────────────────────────────────────────────────────────────
describe('Module Championship — scénario multi-rôles (SeasonChampionshipsController)', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());
    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '70:1': adminClubMember,
      '7:1': playerMember,
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

  it('AdminClub (scope CLUB) consulte les championnats de la saison, toutes équipes confondues', async () => {
    const request = {
      params: { clubId: '1', seasonId: '10' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllBySeasonHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it("Coach (scope TEAM, pas de ?teamId=) n'a pas accès à cette vue cross-équipe", async () => {
    const request = {
      params: { clubId: '1', seasonId: '10' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllBySeasonHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (scope TEAM, pas de ?teamId=) n'a pas accès à cette vue cross-équipe", async () => {
    const request = {
      params: { clubId: '1', seasonId: '10' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllBySeasonHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach transmettant ?teamId=<sa propre équipe> passe le guard générique (limite structurelle documentée, docs/modules/auth-roles.md) — la protection réelle est dans le service (voir championships.service.spec.ts §findAllBySeason, "borne la vue à l’équipe de l’appelant")', async () => {
    const request = {
      params: { clubId: '1', seasonId: '10' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllBySeasonHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');
  });
});

// ───────────────────────────────────────────────────────────────────────
// ClubChampionshipsController (B20) — vue cross-équipe "championnats du
// club", même principe que SeasonChampionshipsController (B16) : seul un
// scope CLUB/ALL satisfait `championship READ` sans `?teamId=` ; un
// Coach/Player transmettant `?teamId=` passe le guard générique (limite
// structurelle documentée) mais le SERVICE borne la vue à cette seule
// équipe (championships.service.spec.ts §findAllByClub).
// ───────────────────────────────────────────────────────────────────────
describe('Module Championship — scénario multi-rôles (ClubChampionshipsController)', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    const permissionsService = new PermissionsService(buildPrismaStub());
    const membersByUserAndClub: Record<string, Member> = {
      '71:1': coachMember,
      '70:1': adminClubMember,
      '7:1': playerMember,
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

  it('AdminClub (scope CLUB) consulte les championnats du club, toutes équipes confondues', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllByClubHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it("Coach (scope TEAM, pas de ?teamId=) n'a pas accès à cette vue cross-équipe", async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllByClubHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("Player (scope TEAM, pas de ?teamId=) n'a pas accès à cette vue cross-équipe", async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllByClubHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
