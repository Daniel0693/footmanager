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
import { SeasonRosterImportService } from '../seasons/season-roster-import.service';
import { SeasonActivationService } from '../seasons/season-activation.service';
import { PlayerObjectivesController } from '../player-objectives/player-objectives.controller';
import { PlayerObjectivesService } from '../player-objectives/player-objectives.service';

/**
 * A13 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), appliqué au module Season
 * (Partie A), miroir de `effectif-multi-role.integration.spec.ts` (A8) et
 * `calendrier-multi-role.integration.spec.ts` (B9). Même scénario canonique
 * "Marc" : Coach équipe U15 (équipe 5, Club 1), Player équipe Seniors
 * (équipe 8, Club 1), Parent d'un enfant équipe U10 (équipe 12, Club 2,
 * `Member` distinct par club).
 *
 * Couvre les deux volets du plan A13 :
 * 1. `SeasonsController` — Coach crée/importe le roster/active une saison
 *    U15 ; Player Seniors lit ses propres saisons sans pouvoir écrire ;
 *    Parent Club B n'a aucun accès.
 * 2. Filtrage rétroactif par saison (A12), via `PlayerObjectivesController`
 *    comme représentant des 4 entités partageant `resolveSeasonPeriod`
 *    (Entretien/Notes/Objectifs/Évaluation, même mécanisme) — Player
 *    Seniors filtre son propre profil par une saison de SON équipe, mais ne
 *    peut pas s'en servir pour lire les bornes d'une saison d'une AUTRE
 *    équipe (404, pas une fuite de données).
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
}

// memberId 42 = Marc (Club 1) : Coach équipe 5 (U15) + Player équipe 8
// (Seniors). memberId 55 = Marc (Club 2) : Parent, MemberRole équipe 12
// (U10) — le rôle Parent n'a aucune permission `season`/`player_objective`
// (voir backend/prisma/seed.ts), vérifié explicitement ci-dessous plutôt
// que supposé.
function buildMemberRolesByMember(roles: ResourceRoles): Record<number, any[]> {
  return {
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
}

function buildGuard(roles: ResourceRoles) {
  const memberRolesByMember = buildMemberRolesByMember(roles);
  const permissionsPrismaStub = {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
  } as unknown as PrismaService;
  const permissionsService = new PermissionsService(permissionsPrismaStub);

  const membersByUserAndClub: Record<string, Member> = {
    '71:1': marcClub1,
    '71:2': marcClub2,
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
// season — ressource scopée équipe via l'URL (docs/roadmap.md, décision
// transverse #3 : une ressource dédiée par entité, pas de scope OWN).
// ───────────────────────────────────────────────────────────────────────
describe('A13 — scénario multi-rôles (SeasonsController)', () => {
  const permissions = {
    readTeam: { id: 1, resource: 'season', action: 'READ', scope: 'TEAM' },
    createTeam: { id: 2, resource: 'season', action: 'CREATE', scope: 'TEAM' },
    updateTeam: { id: 3, resource: 'season', action: 'UPDATE', scope: 'TEAM' },
    deleteTeam: { id: 4, resource: 'season', action: 'DELETE', scope: 'TEAM' },
  } as const;
  const roles: ResourceRoles = {
    coach: {
      id: 1,
      isSystem: true,
      rolePermissions: [
        { permission: permissions.readTeam },
        { permission: permissions.createTeam },
        { permission: permissions.updateTeam },
        { permission: permissions.deleteTeam },
      ],
    },
    // Même pattern que le seed réel (backend/prisma/seed.ts) : Player n'a
    // que READ/TEAM sur `season` (peuple le sélecteur de saison, A12),
    // aucun droit d'écriture.
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readTeam }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
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
  let rosterImportService: SeasonRosterImportService;
  let activationService: SeasonActivationService;
  let teamFindFirst: jest.Mock;
  let seasonCreate: jest.Mock;
  let seasonFindMany: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let seasonCount: jest.Mock;
  let seasonFindUniqueOrThrow: jest.Mock;
  let playerTeamFindMany: jest.Mock;
  let txSeasonUpdate: jest.Mock;
  let txPlayerTeamUpdateMany: jest.Mock;
  let seasonsStore: Season[];

  beforeEach(() => {
    guard = buildGuard(roles);
    seasonsStore = [];

    teamFindFirst = jest.fn(
      ({ where }: { where: { id: number; clubId: number } }) => {
        const teamsByIdAndClub: Record<string, { id: number; clubId: number }> =
          {
            '5:1': { id: 5, clubId: 1 },
            '8:1': { id: 8, clubId: 1 },
            '12:2': { id: 12, clubId: 2 },
          };
        return Promise.resolve(
          teamsByIdAndClub[`${where.id}:${where.clubId}`] ?? null,
        );
      },
    );
    seasonCreate = jest.fn(({ data }: { data: Partial<Season> }) => {
      const season = {
        id: 200,
        teamNameSnapshot: null,
        categorySnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Season;
      seasonsStore.push(season);
      return Promise.resolve(season);
    });
    seasonFindMany = jest.fn(({ where }: { where: { teamId: number } }) =>
      Promise.resolve(seasonsStore.filter((s) => s.teamId === where.teamId)),
    );
    // `findSeasonOrThrow`/`resolveSeasonPeriod` filtrent par {id, teamId,
    // ...} — le nested `team: { clubId }` de findSeasonOrThrow n'a pas
    // besoin d'être réévalué ici, les fixtures ne mélangent jamais club/
    // équipe de façon incohérente.
    seasonFindFirst = jest.fn(
      ({ where }: { where: { id: number; teamId?: number } }) =>
        Promise.resolve(
          seasonsStore.find(
            (s) => s.id === where.id && s.teamId === where.teamId,
          ) ?? null,
        ),
    );
    seasonCount = jest.fn(
      ({ where }: { where: { teamId: number; status: string } }) =>
        Promise.resolve(
          seasonsStore.filter(
            (s) => s.teamId === where.teamId && s.status === where.status,
          ).length,
        ),
    );
    seasonFindUniqueOrThrow = jest.fn(
      ({ where: { id } }: { where: { id: number } }) =>
        Promise.resolve(seasonsStore.find((s) => s.id === id)),
    );
    playerTeamFindMany = jest.fn().mockResolvedValue([]);
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
    txPlayerTeamUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      season: {
        create: seasonCreate,
        findMany: seasonFindMany,
        findFirst: seasonFindFirst,
        count: seasonCount,
        findUniqueOrThrow: seasonFindUniqueOrThrow,
      },
      playerTeam: { findMany: playerTeamFindMany },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          season: { update: txSeasonUpdate },
          playerTeam: { updateMany: txPlayerTeamUpdateMany },
        }),
      ),
    } as unknown as PrismaService;

    seasonsService = new SeasonsService(prismaStub);
    rosterImportService = new SeasonRosterImportService(
      prismaStub,
      seasonsService,
    );
    activationService = new SeasonActivationService(prismaStub, seasonsService);
  });

  it('Coach (équipe 5, U15) : crée une saison DRAFT, importe un roster vide puis l’active — flux réel complet', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    const created = await seasonsService.create(1, 5, {
      name: 'Saison U15 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-30'),
    });
    expect(seasonCreate).toHaveBeenCalled();
    expect(created.status).toBe('DRAFT');

    const preview = await rosterImportService.previewRoster(1, 5, created.id);
    expect(preview).toEqual([]);
    const imported = await rosterImportService.importRoster(
      1,
      5,
      created.id,
      [],
    );
    expect(imported).toEqual({ importedCount: 0 });

    const activated = await activationService.activate(1, 5, created.id);
    expect(activated.status).toBe('ACTIVE');
    expect(txPlayerTeamUpdateMany).not.toHaveBeenCalled(); // pas d'ancienne saison ACTIVE à clore

    // Même personne, même club, mais son seul rôle sur l'équipe 8 est
    // Player (READ seul) : le guard doit refuser la création là-bas.
    const createOnPlayerTeam = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createOnPlayerTeam, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, Seniors) : lit ses propres saisons, refusé en écriture par le guard', async () => {
    seasonsStore.push({
      id: 201,
      teamId: 8,
      name: 'Saison Seniors 2026-2027',
      teamNameSnapshot: null,
      categorySnapshot: null,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const readRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, findAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');
    const seasons = await seasonsService.findAllByTeam(1, 8);
    expect(seasons.map((s) => s.id)).toEqual([201]);

    const writeRequest = {
      params: { clubId: '1', teamId: '8' },
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

  it('Parent (Club 2) : aucun accès à `season`, quelle que soit l’équipe ou l’action', async () => {
    const request = {
      params: { clubId: '2', teamId: '12' },
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
// Notes/Objectifs/Évaluation, Mesures explicitement exclu).
// ───────────────────────────────────────────────────────────────────────
describe('A13 — scénario multi-rôles (filtrage par saison, PlayerObjectivesController)', () => {
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

  // Saison de l'équipe 8 (Seniors, celle de Marc-Player) et saison de
  // l'équipe 5 (U15, celle de Marc-Coach) — jamais confondues par
  // `resolveSeasonPeriod`, qui filtre toujours par le `teamId` transmis en
  // query par l'appelant.
  const seasonSeniors: Season = {
    id: 201,
    teamId: 8,
    name: 'Saison Seniors 2026-2027',
    teamNameSnapshot: null,
    categorySnapshot: null,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-06-30'),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const seasonU15: Season = {
    ...seasonSeniors,
    id: 200,
    teamId: 5,
    name: 'Saison U15 2026-2027',
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
      ({ where }: { where: { id: number; teamId?: number } }) =>
        Promise.resolve(
          [seasonSeniors, seasonU15].find(
            (s) => s.id === where.id && s.teamId === where.teamId,
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

  it('Player (équipe 8, Seniors, profil 100) : filtre son propre profil par la saison de SON équipe', async () => {
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
        startDate: { gte: seasonSeniors.startDate, lte: seasonSeniors.endDate },
      },
      include: { assignedBy: true },
      orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
    });
  });

  it('Player (équipe 8, Seniors) : un seasonId d’une AUTRE équipe (U15) ne renvoie aucune période — 404, pas de fuite de bornes de dates', async () => {
    const request = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8', seasonId: '200' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));

    // `resolveSeasonPeriod` cherche season{id:200, teamId:8} — id 200
    // n'existe que pour teamId 5, donc introuvable dans le scope équipe 8.
    await expect(
      service.findAllByPlayer(
        1,
        100,
        { memberId: request.member!.id, scope: 'OWN', teamId: 8 },
        { seasonId: 200 },
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveFindMany).not.toHaveBeenCalled();
  });

  it('Coach (équipe 5, U15) : filtre le profil d’un coéquipier par la saison de l’équipe 5', async () => {
    const request = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '5', seasonId: '200' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, findAllHandler));
    expect(request.permissionScope).toBe('TEAM');

    await service.findAllByPlayer(
      1,
      300,
      { memberId: request.member!.id, scope: 'TEAM', teamId: 5 },
      { seasonId: 200 },
    );
    expect(playerTeamFindFirst).toHaveBeenCalledWith({
      where: { playerId: 300, teamId: 5, leaveDate: null },
    });
    expect(objectiveFindMany).toHaveBeenCalledWith({
      where: {
        playerId: 300,
        status: undefined,
        theme: undefined,
        startDate: { gte: seasonU15.startDate, lte: seasonU15.endDate },
      },
      include: { assignedBy: true },
      orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
    });
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
