import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PlayerProfile } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

import { CreateEventDto } from '../events/dto/create-event.dto';
import { EventsController } from '../events/events.controller';
import { EventsService } from '../events/events.service';
import { PlayerAbsencesController } from '../player-absences/player-absences.controller';
import { PlayerAbsencesService } from '../player-absences/player-absences.service';

/**
 * B9 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), appliqué au module Calendrier
 * (Event, PlayerAbsence, agrégations "mine"), miroir de
 * `effectif-multi-role.integration.spec.ts` (A8). Même scénario canonique
 * "Marc" que le document de référence : Coach équipe U15 (ici équipe 5,
 * Club 1), Player équipe Seniors (ici équipe 8, Club 1), Parent d'un enfant
 * équipe U10 (ici équipe 12, Club 2, `Member` distinct par club).
 *
 * Marc (userId 71) :
 * - Coach de l'équipe 5 (Club 1, Member 42) — scope TEAM sur `event` et
 *   `player_absence`.
 * - Player de l'équipe 8 (Club 1, Member 42, profil joueur 100) — scope TEAM
 *   (lecture seule) sur `event`, scope OWN sur `player_absence`.
 * - Parent (Club 2, Member 55, MemberRole équipe 12) : aucune permission
 *   `event`/`player_absence` n'est jamais accordée au rôle Parent (comme en
 *   A8 pour l'Effectif) — vérifié explicitement plutôt que supposé.
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

// Profil joueur de Marc lui-même (équipe 8) — utilisé pour le sous-scénario
// Player/OWN sur PlayerAbsence.
const marcPlayerProfile: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Coéquipier de l'équipe 5, cible des actions de Marc-Coach (jamais Marc
// lui-même) — même rôle que dans effectif-multi-role.integration.spec.ts.
const teammateProfile: PlayerProfile = {
  id: 300,
  memberId: 301,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Joueur d'une AUTRE équipe du Club 1 (ni 5 ni 8) — vérifie que Marc-Coach
// ne peut pas agir sur lui en transmettant sa propre équipe (teamId=5) en
// query, la régression corrigée avant A7.3 (assertPlayerInTeam).
const outsiderProfile: PlayerProfile = {
  id: 400,
  memberId: 401,
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

// memberId 42 = Marc (Club 1) : Coach équipe 5 + Player équipe 8.
// memberId 55 = Marc (Club 2) : Parent, MemberRole équipe 12 (le rôle
// Parent n'a lui-même aucune permission Calendrier — voir docs/roadmap.md
// Partie B "hors scope").
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
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
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

function findPlayerAmong(profiles: PlayerProfile[]) {
  return jest.fn(({ where: { id } }: { where: { id: number } }) =>
    Promise.resolve(profiles.find((p) => p.id === id) ?? null),
  );
}

// ───────────────────────────────────────────────────────────────────────
// event — scopé équipe via :teamId dans l'URL (pas de scope OWN, un
// événement n'appartient à personne en particulier, docs/roadmap.md B0)
// ───────────────────────────────────────────────────────────────────────
describe('B9 — scénario multi-rôles (EventsController)', () => {
  const permissions = {
    readTeam: { id: 1, resource: 'event', action: 'READ', scope: 'TEAM' },
    createTeam: { id: 2, resource: 'event', action: 'CREATE', scope: 'TEAM' },
    updateTeam: { id: 3, resource: 'event', action: 'UPDATE', scope: 'TEAM' },
    deleteTeam: { id: 4, resource: 'event', action: 'DELETE', scope: 'TEAM' },
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
    // que READ/TEAM sur `event`, aucun scope OWN.
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readTeam }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = EventsController.prototype.create;
  const findAllHandler = EventsController.prototype.findAll;
  const updateHandler = EventsController.prototype.update;
  const removeHandler = EventsController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: EventsService;
  let teamFindFirst: jest.Mock;
  let eventCreate: jest.Mock;
  let eventFindMany: jest.Mock;
  let eventFindFirst: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    eventCreate = jest.fn().mockResolvedValue({ id: 1 });
    eventFindMany = jest.fn().mockResolvedValue([]);
    eventFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 1, teamId: 5, recurringGroupId: null });
    eventUpdate = jest.fn().mockResolvedValue({ id: 1 });
    eventDelete = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      event: {
        create: eventCreate,
        findMany: eventFindMany,
        findFirst: eventFindFirst,
        update: eventUpdate,
        delete: eventDelete,
      },
      match: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    // membersService/permissionsService ne sont utilisés que par
    // findMineInClub (voir describe "agrégations mine" plus bas) — stubs
    // vides ici, ce test exerce le CRUD scopé équipe.
    service = new EventsService(
      prismaStub,
      {} as MembersService,
      {} as PermissionsService,
    );
  });

  it('Coach (équipe 5) : CRUD complet réel, refusé en CREATE sur l’équipe 8 où il n’est que Player', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    const dto: CreateEventDto = {
      type: 'TRAINING',
      title: 'Entraînement',
      startAt: new Date('2026-07-10T18:00:00.000Z'),
    };
    await service.create(1, 5, dto);
    expect(eventCreate).toHaveBeenCalled();
    await service.findAllByTeam(1, 5);
    expect(eventFindMany).toHaveBeenCalled();
    await service.update(1, 5, 1, { title: 'Mis à jour' });
    expect(eventUpdate).toHaveBeenCalled();
    await service.remove(1, 5, 1);
    expect(eventDelete).toHaveBeenCalled();

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

  it('Player (équipe 8) : lecture seule, création/édition/suppression refusées par le guard', async () => {
    const readRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, findAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');
    await service.findAllByTeam(1, 8);
    expect(eventFindMany).toHaveBeenCalled();

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
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('Parent (Club 2) : aucun accès à `event`, quelle que soit l’équipe ou l’action', async () => {
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
// player_absence — scopé joueur via ?teamId= (même pattern que les 5
// ressources Effectif A7.x), pas de modèle de visibilité
// ───────────────────────────────────────────────────────────────────────
describe('B9 — scénario multi-rôles (PlayerAbsencesController)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_absence',
      action: 'READ',
      scope: 'TEAM',
    },
    createTeam: {
      id: 2,
      resource: 'player_absence',
      action: 'CREATE',
      scope: 'TEAM',
    },
    updateTeam: {
      id: 3,
      resource: 'player_absence',
      action: 'UPDATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 4,
      resource: 'player_absence',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: {
      id: 5,
      resource: 'player_absence',
      action: 'READ',
      scope: 'OWN',
    },
    createOwn: {
      id: 6,
      resource: 'player_absence',
      action: 'CREATE',
      scope: 'OWN',
    },
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
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [
        { permission: permissions.readOwn },
        { permission: permissions.createOwn },
      ],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerAbsencesController.prototype.create;
  const findAllHandler = PlayerAbsencesController.prototype.findAll;
  const updateHandler = PlayerAbsencesController.prototype.update;
  const removeHandler = PlayerAbsencesController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerAbsencesService;
  let playerFindFirst: jest.Mock;
  let absenceCreate: jest.Mock;
  let absenceFindMany: jest.Mock;
  let absenceFindFirst: jest.Mock;
  let absenceUpdate: jest.Mock;
  let absenceDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    absenceCreate = jest.fn().mockResolvedValue({ id: 1 });
    absenceFindMany = jest.fn().mockResolvedValue([]);
    absenceFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 300 });
    absenceUpdate = jest.fn().mockResolvedValue({ id: 1 });
    absenceDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerAbsence: {
        create: absenceCreate,
        findMany: absenceFindMany,
        findFirst: absenceFindFirst,
        update: absenceUpdate,
        delete: absenceDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerAbsencesService(prismaStub);
  });

  it('Coach (équipe 5) : CRUD complet sur un coéquipier, refusé pour un joueur hors équipe même avec sa propre équipe en query', async () => {
    const request = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(request, createHandler));
    expect(request.permissionScope).toBe('TEAM');
    const requester = {
      memberId: request.member!.id,
      scope: 'TEAM' as const,
      teamId: 5,
    };

    await service.create(
      1,
      300,
      requester.memberId,
      {
        reason: 'INJURY',
        startDate: new Date('2026-07-10'),
        endDate: new Date('2026-07-15'),
      },
      requester,
    );
    expect(absenceCreate).toHaveBeenCalled();
    await service.update(1, 300, 1, { reason: 'ILLNESS' }, requester);
    expect(absenceUpdate).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(absenceDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        requester.memberId,
        {
          reason: 'INJURY',
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-15'),
        },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit et déclare ses propres absences (isExcused forcé à null), écriture pour un tiers refusée par le guard', async () => {
    const readRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(readRequest, findAllHandler));
    expect(readRequest.permissionScope).toBe('OWN');
    await service.findAllByPlayer(1, 100, {
      memberId: readRequest.member!.id,
      scope: 'OWN',
    });
    expect(absenceFindMany).toHaveBeenCalled();

    const createOwnRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(createOwnRequest, createHandler));
    expect(createOwnRequest.permissionScope).toBe('OWN');
    await service.create(
      1,
      100,
      createOwnRequest.member!.id,
      {
        reason: 'VACATION',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
        isExcused: true,
      },
      { memberId: createOwnRequest.member!.id, scope: 'OWN' },
    );
    expect(absenceCreate).toHaveBeenCalledWith({
      data: {
        playerId: 100,
        reportedById: createOwnRequest.member!.id,
        reason: 'VACATION',
        description: undefined,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
        isExcused: null,
      },
      include: { reportedBy: true },
    });

    // Coéquipier (profil 300) : Marc n'a que READ/CREATE en scope OWN sur
    // cette ressource, jamais TEAM sur l'équipe 8 (il n'y est que Player) —
    // le guard laisse passer (il vérifie seulement "Marc a-t-il un scope
    // quelconque sur player_absence/CREATE dans ce contexte ?", pas que le
    // joueur ciblé est bien lui-même), c'est le service qui doit refuser en
    // comparant playerId au memberId de l'appelant (même garde-fou que
    // findAllByPlayer/OWN).
    const createForOtherRequest = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(createForOtherRequest, createHandler));
    expect(createForOtherRequest.permissionScope).toBe('OWN');
    await expect(
      service.create(
        1,
        300,
        createForOtherRequest.member!.id,
        {
          reason: 'VACATION',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-10'),
        },
        { memberId: createForOtherRequest.member!.id, scope: 'OWN' },
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Parent (Club 2) : aucun accès, quelle que soit l’action', async () => {
    const request = {
      params: { clubId: '2', playerId: '100' },
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
// Agrégations "mine" (EventsService.findMineInClub,
// MembersService.findBirthdaysInClub) — contournent volontairement
// PermissionsGuard (docs/modules/auth-roles.md §Patterns découverts), donc
// jamais exercées via le guard ci-dessus. Exercées ici avec le vrai
// PermissionsService + le vrai MembersService (pas des stubs de service
// entiers) pour prouver le comportement multi-rôles bout-en-bout.
// ───────────────────────────────────────────────────────────────────────
describe('B9 — scénario multi-rôles (agrégations "mine" — events/mine, members/birthdays)', () => {
  let memberFindUnique: jest.Mock;
  let memberFindMany: jest.Mock;
  let teamFindMany: jest.Mock;
  let eventFindMany: jest.Mock;
  let permissionsService: PermissionsService;
  let membersService: MembersService;
  let eventsService: EventsService;

  function setup(roles: ResourceRoles) {
    const memberRolesByMember = buildMemberRolesByMember(roles);
    const permissionsPrismaStub = {
      memberRole: {
        findMany: jest.fn(
          ({ where: { memberId } }: { where: { memberId: number } }) =>
            Promise.resolve(memberRolesByMember[memberId] ?? []),
        ),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    permissionsService = new PermissionsService(permissionsPrismaStub);

    const membersByKey: Record<string, Member> = {
      '71:1': marcClub1,
      '71:2': marcClub2,
    };
    memberFindUnique = jest.fn(
      ({
        where: { userId_clubId },
      }: {
        where: { userId_clubId: { userId: number; clubId: number } };
      }) =>
        Promise.resolve(
          membersByKey[`${userId_clubId.userId}:${userId_clubId.clubId}`] ??
            null,
        ),
    );
    memberFindMany = jest.fn().mockResolvedValue([]);
    teamFindMany = jest.fn().mockResolvedValue([]);
    const membersPrismaStub = {
      member: { findUnique: memberFindUnique, findMany: memberFindMany },
      team: { findMany: teamFindMany },
    } as unknown as PrismaService;
    membersService = new MembersService(membersPrismaStub, permissionsService);

    eventFindMany = jest.fn().mockResolvedValue([]);
    const eventsPrismaStub = {
      event: { findMany: eventFindMany },
    } as unknown as PrismaService;
    eventsService = new EventsService(
      eventsPrismaStub,
      membersService,
      permissionsService,
    );
  }

  // Coach équipe 5 + Player équipe 8, mêmes permissions que dans les
  // describe précédents (aucune permission club-entier).
  const marcRoles: ResourceRoles = {
    coach: {
      id: 1,
      isSystem: true,
      rolePermissions: [
        {
          permission: {
            id: 1,
            resource: 'event',
            action: 'READ',
            scope: 'TEAM',
          },
        },
        {
          permission: {
            id: 2,
            resource: 'member',
            action: 'READ',
            scope: 'TEAM',
          },
        },
      ],
    },
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [
        {
          permission: {
            id: 1,
            resource: 'event',
            action: 'READ',
            scope: 'TEAM',
          },
        },
        {
          permission: {
            id: 3,
            resource: 'member',
            action: 'READ',
            scope: 'OWN',
          },
        },
      ],
    },
    // Rôle Parent réel : seule permission `member READ OWN` (voir seed.ts),
    // aucune permission `event`.
    parent: {
      id: 3,
      isSystem: true,
      rolePermissions: [
        {
          permission: {
            id: 4,
            resource: 'member',
            action: 'READ',
            scope: 'OWN',
          },
        },
      ],
    },
  };

  it('Marc (Club 1, Coach équipe 5 + Player équipe 8) : "mon calendrier" et "mes anniversaires" agrègent les DEUX équipes, pas une seule', async () => {
    setup(marcRoles);

    await eventsService.findMineInClub(1, 71);
    // Aucune permission club-entier (READ/TEAM uniquement sur les deux
    // rôles) : le filtre retombe sur "toute équipe où Marc a un
    // MemberRole" — la requête relationnelle ne restreint pas à une seule
    // équipe, elle matchera équipe 5 ET équipe 8 en base réelle.
    expect(eventFindMany).toHaveBeenCalledWith({
      where: {
        team: {
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        },
        type: undefined,
        startAt: { gte: undefined, lte: undefined },
      },
      include: {
        team: { select: { id: true, name: true } },
        match: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    await membersService.findBirthdaysInClub(1, 71, {
      dateFrom: new Date(2026, 0, 1),
      dateTo: new Date(2026, 11, 31),
    });
    expect(teamFindMany).toHaveBeenCalledWith({
      where: {
        clubId: 1,
        memberRoles: { some: { memberId: 42, teamId: { not: null } } },
      },
      select: { id: true },
    });
  });

  // Constat documenté (pas un bug introduit par le module Calendrier — même
  // logique préexistante dans TeamsService.findMineInClub, voir
  // docs/modules/auth-roles.md §Patterns découverts) : les agrégations
  // "mine" retombent sur "Marc a-t-il UN MemberRole quelconque scopé sur
  // cette équipe ?" comme proxy d'accessibilité, sans revérifier que LA
  // permission précise (event/member READ) est bien accordée à CE rôle sur
  // CETTE équipe. Le rôle Parent, dont la seule permission Calendrier
  // réelle est `member READ OWN` (jamais `event`), voit donc quand même le
  // calendrier et les anniversaires de l'équipe 12 dès lors qu'il y possède
  // un MemberRole — simplement parce que ce MemberRole existe, pas parce
  // que le rôle Parent y est autorisé. Sans impact aujourd'hui (le rôle
  // Parent n'est pas câblé à un MemberRole en pratique, décision ouverte
  // #5), mais latent si cela change sans revoir ce point.
  it('Marc (Club 2, Parent équipe 12) : les agrégations "mine" utilisent l’existence d’un MemberRole comme proxy, pas la permission `event`/`member` réelle du rôle Parent', async () => {
    setup(marcRoles);
    teamFindMany.mockResolvedValue([{ id: 12 }]);

    await eventsService.findMineInClub(2, 71);
    expect(eventFindMany).toHaveBeenCalledWith({
      where: {
        team: {
          clubId: 2,
          memberRoles: { some: { memberId: 55, teamId: { not: null } } },
        },
        type: undefined,
        startAt: { gte: undefined, lte: undefined },
      },
      include: {
        team: { select: { id: true, name: true } },
        match: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    await membersService.findBirthdaysInClub(2, 71, {
      dateFrom: new Date(2026, 0, 1),
      dateTo: new Date(2026, 11, 31),
    });
    expect(teamFindMany).toHaveBeenCalledWith({
      where: {
        clubId: 2,
        memberRoles: { some: { memberId: 55, teamId: { not: null } } },
      },
      select: { id: true },
    });
    expect(memberFindMany).toHaveBeenCalledWith({
      where: {
        clubId: 2,
        birthDate: { not: null },
        OR: [
          { memberRoles: { some: { teamId: { in: [12] } } } },
          {
            playerProfile: {
              playerTeams: { some: { teamId: { in: [12] }, leaveDate: null } },
            },
          },
        ],
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
  });
});
