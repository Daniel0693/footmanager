import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PlayerProfile, Season } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

import { SeasonsController } from '../seasons/seasons.controller';
import { SeasonsService } from '../seasons/seasons.service';
import { PlayerObjectivesController } from '../player-objectives/player-objectives.controller';
import { PlayerObjectivesService } from '../player-objectives/player-objectives.service';

/**
 * A13/A19 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), appliqué au module Season
 * (Partie A), miroir de `effectif-multi-role.integration.spec.ts` (A8) et
 * `calendrier-multi-role.integration.spec.ts` (B9). Réécrit en A14/A15 :
 * `Season` est désormais club-wide (plus scopée équipe), sa gestion réservée
 * à AdminClub — le scénario canonique "Marc" (Coach U15/Player Seniors/
 * Parent Club B) ne peut donc plus servir à tester la CRÉATION/ACTIVATION
 * d'une saison (Marc n'a jamais ce rôle) ; un persona AdminClub dédié est
 * ajouté pour ce volet.
 *
 * Couvre les deux volets révisés :
 * 1. `SeasonsController` — AdminClub crée/active une saison club-wide ;
 *    Coach et Player (Marc) lisent seulement, via `?teamId=` (route
 *    club-only, même pattern que `evaluation_config`) ; aucun accès pour un
 *    membre sans rôle.
 * 2. Filtrage rétroactif par saison (A12), via `PlayerObjectivesController`
 *    comme représentant des 4 entités partageant `resolveSeasonPeriod`
 *    (Entretien/Notes/Objectifs/Évaluation) — Coach (équipe 5) et Player
 *    (équipe 8, son propre profil) filtrent tous deux par une saison du
 *    MÊME club (partagée entre leurs deux équipes) ; un `seasonId`
 *    appartenant à un AUTRE club est rejeté (404, pas de fuite de bornes de
 *    dates).
 */

const marcClub1: Member = {
  id: 42,
  userId: 71,
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

const marcClub2: Member = {
  id: 55,
  userId: 71,
  clubId: 2,
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

// AdminClub du Club 1 — seul habilité à créer/activer une saison depuis A14.
const aliceAdminClub: Member = {
  id: 90,
  userId: 80,
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

// Profil joueur de Marc lui-même (équipe 8, Seniors) — sous-scénario
// Player/OWN sur le filtrage par saison des objectifs.
const marcPlayerProfile: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Coéquipier de l'équipe 5 (U15), cible des actions de Marc-Coach.
const teammateProfile: PlayerProfile = {
  id: 300,
  memberId: 301,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildContext(
  request: Partial<PermissionedRequest>,
  handler: (...args: any[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

interface ResourceRoles {
  coach: unknown;
  player: unknown;
  parent: unknown;
  adminClub?: unknown;
}

// memberId 42 = Marc (Club 1) : Coach équipe 5 (U15) + Player équipe 8
// (Seniors) — les deux équipes partagent le même pool de saisons du Club 1.
// memberId 55 = Marc (Club 2) : Parent, MemberRole équipe 12 (U10) — le rôle
// Parent n'a aucune permission `season`/`player_objective` (voir
// backend/prisma/seed.ts), vérifié explicitement ci-dessous plutôt que
// supposé. memberId 90 = Alice (Club 1) : AdminClub, scope club entier
// (teamId null).
function buildMemberRolesByMember(roles: ResourceRoles): Record<number, any[]> {
  const entries: Record<number, any[]> = {
    42: [
      {
        memberId: 42,
        clubId: 1,
        teamId: 5,
        startDate: null,
        endDate: null,
        role: roles.coach,
      },
      {
        memberId: 42,
        clubId: 1,
        teamId: 8,
        startDate: null,
        endDate: null,
        role: roles.player,
      },
    ],
    55: [
      {
        memberId: 55,
        clubId: 2,
        teamId: 12,
        startDate: null,
        endDate: null,
        role: roles.parent,
      },
    ],
  };
  if (roles.adminClub) {
    entries[90] = [
      {
        memberId: 90,
        clubId: 1,
        teamId: null,
        startDate: null,
        endDate: null,
        role: roles.adminClub,
      },
    ];
  }
  return entries;
}

function buildPermissionsService(roles: ResourceRoles) {
  const memberRolesByMember = buildMemberRolesByMember(roles);
  const permissionsPrismaStub = {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
  } as unknown as PrismaService;
  return new PermissionsService(permissionsPrismaStub);
}

function buildGuard(roles: ResourceRoles) {
  const permissionsService = buildPermissionsService(roles);

  const membersByUserAndClub: Record<string, Member> = {
    '71:1': marcClub1,
    '71:2': marcClub2,
    '80:1': aliceAdminClub,
  };
  const findByUserAndClub = jest.fn((userId: number, clubId: number) =>
    Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
  );
  const membersService = { findByUserAndClub } as unknown as MembersService;

  return new PermissionsGuard(
    new Reflector(),
    permissionsService,
    membersService,
  );
}

// ───────────────────────────────────────────────────────────────────────
// season — club-wide depuis A14 : gestion réservée à AdminClub, Coach/Player
// en lecture seule via ?teamId= (route club-only, sans :teamId dans l'URL).
// ───────────────────────────────────────────────────────────────────────
describe('A13/A19 — scénario multi-rôles (SeasonsController, club-wide)', () => {
  const permissions = {
    readTeam: { id: 1, resource: 'season', action: 'READ', scope: 'TEAM' },
    createClub: {
      id: 2,
      resource: 'season',
      action: 'CREATE',
      scope: 'CLUB',
    },
    updateClub: {
      id: 3,
      resource: 'season',
      action: 'UPDATE',
      scope: 'CLUB',
    },
  } as const;
  const roles: ResourceRoles = {
    // Coach/Player n'ont plus, depuis A14, que la lecture sur `season`.
    coach: {
      id: 1,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readTeam }],
    },
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readTeam }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
    adminClub: {
      id: 4,
      isSystem: true,
      rolePermissions: [
        { permission: permissions.createClub },
        { permission: permissions.updateClub },
      ],
    },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = SeasonsController.prototype.create;
  const findAllHandler = SeasonsController.prototype.findAll;
  const updateHandler = SeasonsController.prototype.update;
  const removeHandler = SeasonsController.prototype.remove;
  const activateHandler = SeasonsController.prototype.activate;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let seasonsService: SeasonsService;
  let seasonCreate: jest.Mock;
  let seasonFindMany: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let seasonCount: jest.Mock;
  let seasonFindUniqueOrThrow: jest.Mock;
  let txSeasonUpdate: jest.Mock;
  let seasonsStore: Season[];

  beforeEach(() => {
    guard = buildGuard(roles);
    seasonsStore = [];

    seasonCreate = jest.fn(({ data }: { data: Partial<Season> }) => {
      const season = {
        id: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Season;
      seasonsStore.push(season);
      return Promise.resolve(season);
    });
    seasonFindMany = jest.fn(({ where }: { where: { clubId: number } }) =>
      Promise.resolve(seasonsStore.filter((s) => s.clubId === where.clubId)),
    );
    seasonFindFirst = jest.fn(
      ({
        where,
      }: {
        where: { id?: number; clubId: number; status?: string };
      }) =>
        Promise.resolve(
          seasonsStore.find(
            (s) =>
              (where.id === undefined || s.id === where.id) &&
              s.clubId === where.clubId &&
              (where.status === undefined || s.status === where.status),
          ) ?? null,
        ),
    );
    seasonCount = jest.fn(
      ({ where }: { where: { clubId: number; status: string } }) =>
        Promise.resolve(
          seasonsStore.filter(
            (s) => s.clubId === where.clubId && s.status === where.status,
          ).length,
        ),
    );
    seasonFindUniqueOrThrow = jest.fn(
      ({ where: { id } }: { where: { id: number } }) =>
        Promise.resolve(seasonsStore.find((s) => s.id === id)),
    );
    txSeasonUpdate = jest.fn(
      ({
        where: { id },
        data,
      }: {
        where: { id: number };
        data: Partial<Season>;
      }) => {
        const season = seasonsStore.find((s) => s.id === id);
        if (season) Object.assign(season, data);
        return Promise.resolve(season);
      },
    );

    const prismaStub = {
      season: {
        create: seasonCreate,
        findMany: seasonFindMany,
        findFirst: seasonFindFirst,
        count: seasonCount,
        findUniqueOrThrow: seasonFindUniqueOrThrow,
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ season: { update: txSeasonUpdate } }),
      ),
    } as unknown as PrismaService;

    seasonsService = new SeasonsService(
      prismaStub,
      buildPermissionsService(roles),
    );
  });

  it('AdminClub (Alice) : crée une saison DRAFT pour le club puis l’active — flux réel complet', async () => {
    const createRequest = {
      params: { clubId: '1' },
      user: { userId: 80 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).resolves.toBe(true);
    expect(createRequest.permissionScope).toBe('CLUB');

    const created = await seasonsService.create(1, {
      name: 'Saison 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
    });
    expect(seasonCreate).toHaveBeenCalled();
    expect(created.status).toBe('DRAFT');

    const activateRequest = {
      params: { clubId: '1' },
      user: { userId: 80 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(activateRequest, activateHandler)),
    ).resolves.toBe(true);

    const activated = await seasonsService.activate(1, created.id);
    expect(activated.status).toBe('ACTIVE');
  });

  it('Coach (Marc, équipe 5) : lit les saisons du club via ?teamId=, refusé en écriture', async () => {
    seasonsStore.push({
      id: 200,
      clubId: 1,
      name: 'Saison 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const readRequest = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, findAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');
    const { data: seasons, canManage } = await seasonsService.findAllByClub(
      1,
      42,
    );
    expect(seasons.map((s) => s.id)).toEqual([200]);
    expect(canManage).toBe(false);

    // Même personne, même club, mais son seul rôle est Coach/Player en
    // lecture seule sur `season` — jamais AdminClub.
    const writeRequest = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, activateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(seasonCreate).not.toHaveBeenCalled();
  });

  it('Coach (Marc, équipe 8, Player seul) : sans ?teamId= transmis pour une équipe où il tient un rôle, refusé — route club-only', async () => {
    const request = {
      params: { clubId: '1' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Parent (Marc, Club 2) : aucun accès à `season`, quelle que soit l’action', async () => {
    const request = {
      params: { clubId: '2' },
      query: { teamId: '12' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, updateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Filtrage rétroactif par saison (A12) — player_objective comme
// représentant des 4 entités partageant `resolveSeasonPeriod` (Entretien/
// Notes/Objectifs/Évaluation, Mesures explicitement exclu). Season étant
// club-wide, Coach (équipe 5) et Player (équipe 8) filtrent désormais par la
// MÊME saison, partagée entre leurs deux équipes du Club 1.
// ───────────────────────────────────────────────────────────────────────
describe('A13/A19 — scénario multi-rôles (filtrage par saison, PlayerObjectivesController)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_objective',
      action: 'READ',
      scope: 'TEAM',
    },
    readOwn: {
      id: 2,
      resource: 'player_objective',
      action: 'READ',
      scope: 'OWN',
    },
  } as const;
  const roles: ResourceRoles = {
    coach: {
      id: 1,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readTeam }],
    },
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const findAllHandler = PlayerObjectivesController.prototype.findAll;
  /* eslint-enable @typescript-eslint/unbound-method */

  // Saison du Club 1, partagée par l'équipe 5 (U15, Marc-Coach) ET l'équipe 8
  // (Seniors, Marc-Player) — plus de distinction par équipe, `season` n'a
  // plus de FK vers Team. Saison "étrangère" du Club 2, jamais atteignable
  // depuis le Club 1 via `resolveSeasonPeriod` (scopé clubId).
  const club1Season: Season = {
    id: 201,
    clubId: 1,
    name: 'Saison 2026-2027',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-06-30'),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const club2Season: Season = {
    ...club1Season,
    id: 900,
    clubId: 2,
    name: 'Saison Club 2',
  };

  let guard: PermissionsGuard;
  let service: PlayerObjectivesService;
  let playerFindFirst: jest.Mock;
  let objectiveFindMany: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = jest.fn(({ where: { id } }: { where: { id: number } }) =>
      Promise.resolve(
        [marcPlayerProfile, teammateProfile].find((p) => p.id === id) ?? null,
      ),
    );
    objectiveFindMany = jest.fn().mockResolvedValue([]);
    seasonFindFirst = jest.fn(
      ({ where }: { where: { id: number; clubId?: number } }) =>
        Promise.resolve(
          [club1Season, club2Season].find(
            (s) => s.id === where.id && s.clubId === where.clubId,
          ) ?? null,
        ),
    );
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerObjective: { findMany: objectiveFindMany },
      season: { findFirst: seasonFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerObjectivesService(prismaStub);
  });

  it('Player (équipe 8, Seniors, profil 100) : filtre son propre profil par la saison du club', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8', seasonId: '201' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('OWN');

    await service.findAllByPlayer(
      1,
      100,
      { memberId: request.member!.id, scope: 'OWN', teamId: 8 },
      { seasonId: 201 },
    );
    expect(objectiveFindMany).toHaveBeenCalledWith({
      where: {
        playerId: 100,
        status: undefined,
        theme: undefined,
        startDate: { gte: club1Season.startDate, lte: club1Season.endDate },
      },
      include: { assignedBy: true },
      orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
    });
  });

  it('Coach (équipe 5, U15) : filtre le profil d’un coéquipier par la MÊME saison du club (partagée avec l’équipe 8)', async () => {
    const request = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '5', seasonId: '201' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    await service.findAllByPlayer(
      1,
      300,
      { memberId: request.member!.id, scope: 'TEAM', teamId: 5 },
      { seasonId: 201 },
    );
    expect(playerTeamFindFirst).toHaveBeenCalledWith({
      where: { playerId: 300, teamId: 5, leaveDate: null },
    });
    expect(objectiveFindMany).toHaveBeenCalledWith({
      where: {
        playerId: 300,
        status: undefined,
        theme: undefined,
        startDate: { gte: club1Season.startDate, lte: club1Season.endDate },
      },
      include: { assignedBy: true },
      orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
    });
  });

  it('Coach (Club 1) : un seasonId appartenant à un AUTRE club (Club 2) ne renvoie aucune période — 404, pas de fuite de bornes de dates', async () => {
    const request = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '5', seasonId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));

    // `resolveSeasonPeriod` cherche season{id:900, clubId:1} — id 900
    // n'existe que pour clubId 2, donc introuvable dans le scope du Club 1.
    await expect(
      service.findAllByPlayer(
        1,
        300,
        { memberId: request.member!.id, scope: 'TEAM', teamId: 5 },
        { seasonId: 900 },
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveFindMany).not.toHaveBeenCalled();
  });

  it('Parent (Club 2) : aucun accès à `player_objective`, donc jamais au filtrage par saison', async () => {
    const request = {
      params: { clubId: '2', playerId: '100' },
      query: { teamId: '12' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveFindMany).not.toHaveBeenCalled();
  });
});
