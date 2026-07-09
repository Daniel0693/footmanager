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

import { PlayerMeasurementsController } from '../player-measurements/player-measurements.controller';
import { PlayerMeasurementsService } from '../player-measurements/player-measurements.service';
import { PlayerInterviewsController } from '../player-interviews/player-interviews.controller';
import { PlayerInterviewsService } from '../player-interviews/player-interviews.service';
import { PlayerNotesController } from '../player-notes/player-notes.controller';
import { PlayerNotesService } from '../player-notes/player-notes.service';
import { PlayerObjectivesController } from '../player-objectives/player-objectives.controller';
import { PlayerObjectivesService } from '../player-objectives/player-objectives.service';
import { PlayerEvaluationsController } from '../player-evaluations/player-evaluations.controller';
import { PlayerEvaluationsService } from '../player-evaluations/player-evaluations.service';

/**
 * A8 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), appliqué aux 5 ressources du
 * module Effectif (A7.1-A7.5) EN MÊME TEMPS, avec UN SEUL membre cumulant
 * plusieurs rôles dans des contextes distincts. Chaque
 * `*-permissions.integration.spec.ts` de module utilise toujours un
 * utilisateur différent par rôle (Marc = Player, Daniel = Coach, Alice =
 * AdminClub) ; ce fichier prouve que la même personne physique obtient bien
 * des droits différents et correctement isolés selon le contexte, à travers
 * les 5 ressources à la fois — pas seulement au niveau abstrait de
 * `PermissionsService.can()` (déjà couvert par
 * `src/roles/permissions.service.spec.ts`), mais via les vrais
 * guards/services de chaque module. Un futur refactor qui casserait la
 * cohérence pour une seule ressource doit faire échouer ce fichier, même si
 * les 5 fichiers de tests isolés existants restent verts par ailleurs.
 *
 * Marc (userId 71) :
 * - Coach de l'équipe 5 (Club 1, Member 42) — scope TEAM.
 * - Player de l'équipe 8 (Club 1, Member 42, profil joueur 100) — scope OWN.
 * - Parent (Club 2, Member 55 — un Member distinct par club, comme documenté
 *   dans auth-roles.md §Patterns découverts) : aucune permission Effectif
 *   n'est jamais accordée au rôle Parent (pas de liaison Parent↔Joueur, voir
 *   docs/decisions-ouvertes-et-rgpd.md) — vérifié explicitement ici plutôt
 *   que supposé.
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
// Player/OWN.
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
// lui-même : distingue "Marc agit sur un tiers" de "Marc lit ses propres
// données").
const teammateProfile: PlayerProfile = {
  id: 300,
  memberId: 301,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Joueur d'une AUTRE équipe du Club 1 (ni 5, ni 8) — sert à vérifier que
// Marc-Coach ne peut pas agir sur lui même en transmettant sa propre équipe
// (teamId=5) en query : la régression exacte corrigée avant A7.3.
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

function buildGuard(roles: ResourceRoles) {
  // memberId 42 = Marc (Club 1) : Coach équipe 5 + Player équipe 8.
  // memberId 55 = Marc (Club 2) : Parent.
  const memberRolesByMember: Record<number, any[]> = {
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

function findPlayerAmong(profiles: PlayerProfile[]) {
  return jest.fn(({ where: { id } }: { where: { id: number } }) =>
    Promise.resolve(profiles.find((p) => p.id === id) ?? null),
  );
}

// ───────────────────────────────────────────────────────────────────────
// player_measurement — pas d'UPDATE (historique append-only, A7.1)
// ───────────────────────────────────────────────────────────────────────
describe('A8 — scénario multi-rôles (PlayerMeasurements)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_measurement',
      action: 'READ',
      scope: 'TEAM',
    },
    createTeam: {
      id: 2,
      resource: 'player_measurement',
      action: 'CREATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 3,
      resource: 'player_measurement',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: {
      id: 4,
      resource: 'player_measurement',
      action: 'READ',
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
        { permission: permissions.deleteTeam },
      ],
    },
    player: {
      id: 2,
      isSystem: true,
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerMeasurementsController.prototype.create;
  const findAllHandler = PlayerMeasurementsController.prototype.findAll;
  const removeHandler = PlayerMeasurementsController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerMeasurementsService;
  let playerFindFirst: jest.Mock;
  let measurementCreate: jest.Mock;
  let measurementFindMany: jest.Mock;
  let measurementFindFirst: jest.Mock;
  let measurementDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    measurementCreate = jest.fn().mockResolvedValue({ id: 1 });
    measurementFindMany = jest.fn().mockResolvedValue([]);
    measurementFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 1, playerId: 300 });
    measurementDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerMeasurement: {
        create: measurementCreate,
        findMany: measurementFindMany,
        findFirst: measurementFindFirst,
        delete: measurementDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerMeasurementsService(prismaStub);
  });

  it('Coach (équipe 5) : crée/lit/supprime les mesures d’un coéquipier, refusé pour un joueur hors équipe même avec sa propre équipe en query', async () => {
    const request = {
      params: { clubId: '1', playerId: '300' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');
    const requester = {
      memberId: request.member!.id,
      scope: 'TEAM' as const,
      teamId: 5,
    };

    await service.create(
      1,
      300,
      { type: 'HEIGHT', value: 150, date: new Date('2026-06-01') },
      requester,
    );
    expect(measurementCreate).toHaveBeenCalled();
    await service.findAllByPlayer(1, 300, requester);
    expect(measurementFindMany).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(measurementDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        { type: 'HEIGHT', value: 150, date: new Date('2026-06-01') },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit ses propres mesures, création refusée par le guard', async () => {
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
    expect(measurementFindMany).toHaveBeenCalled();

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(measurementCreate).not.toHaveBeenCalled();
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
      guard.canActivate(buildContext(request, removeHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});

// ───────────────────────────────────────────────────────────────────────
// player_interview — staffAssessment jamais visible en scope OWN
// ───────────────────────────────────────────────────────────────────────
describe('A8 — scénario multi-rôles (PlayerInterviews)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_interview',
      action: 'READ',
      scope: 'TEAM',
    },
    createTeam: {
      id: 2,
      resource: 'player_interview',
      action: 'CREATE',
      scope: 'TEAM',
    },
    updateTeam: {
      id: 3,
      resource: 'player_interview',
      action: 'UPDATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 4,
      resource: 'player_interview',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: {
      id: 5,
      resource: 'player_interview',
      action: 'READ',
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
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerInterviewsController.prototype.create;
  const findAllHandler = PlayerInterviewsController.prototype.findAll;
  const updateHandler = PlayerInterviewsController.prototype.update;
  const removeHandler = PlayerInterviewsController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerInterviewsService;
  let playerFindFirst: jest.Mock;
  let interviewCreate: jest.Mock;
  let interviewFindMany: jest.Mock;
  let interviewFindFirst: jest.Mock;
  let interviewUpdate: jest.Mock;
  let interviewDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    interviewCreate = jest.fn().mockResolvedValue({ id: 1 });
    interviewFindMany = jest.fn().mockResolvedValue([]);
    interviewFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 300 });
    interviewUpdate = jest.fn().mockResolvedValue({ id: 1 });
    interviewDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerInterview: {
        create: interviewCreate,
        findMany: interviewFindMany,
        findFirst: interviewFindFirst,
        update: interviewUpdate,
        delete: interviewDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerInterviewsService(prismaStub);
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
      { date: new Date('2026-06-01'), subject: 'Bilan', summary: 'RAS' },
      requester,
    );
    expect(interviewCreate).toHaveBeenCalled();
    await service.update(1, 300, 1, { summary: 'Mis à jour' }, requester);
    expect(interviewUpdate).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(interviewDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        requester.memberId,
        { date: new Date('2026-06-01'), subject: 'Bilan', summary: 'RAS' },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit ses propres entretiens sans jamais voir staffAssessment, création refusée', async () => {
    interviewFindMany.mockResolvedValue([
      {
        id: 1,
        playerId: 100,
        date: new Date('2026-01-01'),
        subject: 'Bilan',
        summary: 'RAS',
        staffFeedback: null,
        staffAssessment: 'Ressenti interne du staff',
        playerFeedback: null,
      },
    ]);
    const readRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(readRequest, findAllHandler));
    expect(readRequest.permissionScope).toBe('OWN');

    const result = await service.findAllByPlayer(1, 100, {
      memberId: readRequest.member!.id,
      scope: 'OWN',
    });
    expect(result[0]).not.toHaveProperty('staffAssessment');

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(interviewCreate).not.toHaveBeenCalled();
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
// player_note — visibilité PRIVE jamais visible en scope OWN
// ───────────────────────────────────────────────────────────────────────
describe('A8 — scénario multi-rôles (PlayerNotes)', () => {
  const permissions = {
    readTeam: { id: 1, resource: 'player_note', action: 'READ', scope: 'TEAM' },
    createTeam: {
      id: 2,
      resource: 'player_note',
      action: 'CREATE',
      scope: 'TEAM',
    },
    updateTeam: {
      id: 3,
      resource: 'player_note',
      action: 'UPDATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 4,
      resource: 'player_note',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: { id: 5, resource: 'player_note', action: 'READ', scope: 'OWN' },
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
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerNotesController.prototype.create;
  const findAllHandler = PlayerNotesController.prototype.findAll;
  const updateHandler = PlayerNotesController.prototype.update;
  const removeHandler = PlayerNotesController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerNotesService;
  let playerFindFirst: jest.Mock;
  let noteCreate: jest.Mock;
  let noteFindMany: jest.Mock;
  let noteFindFirst: jest.Mock;
  let noteUpdate: jest.Mock;
  let noteDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    noteCreate = jest.fn().mockResolvedValue({ id: 1 });
    noteFindMany = jest.fn().mockResolvedValue([]);
    noteFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 300 });
    noteUpdate = jest.fn().mockResolvedValue({ id: 1 });
    noteDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerNote: {
        create: noteCreate,
        findMany: noteFindMany,
        findFirst: noteFindFirst,
        update: noteUpdate,
        delete: noteDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerNotesService(prismaStub);
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
      { visibility: 'SEMI_PRIVE', content: 'Bonne attitude' },
      requester,
    );
    expect(noteCreate).toHaveBeenCalled();
    await service.update(1, 300, 1, { content: 'Mis à jour' }, requester);
    expect(noteUpdate).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(noteDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        requester.memberId,
        { visibility: 'SEMI_PRIVE', content: 'Bonne attitude' },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit ses propres notes sans jamais voir les PRIVE, création refusée', async () => {
    noteFindMany.mockResolvedValue([
      { id: 1, playerId: 100, visibility: 'PRIVE', content: 'Note staff' },
      {
        id: 2,
        playerId: 100,
        visibility: 'SEMI_PRIVE',
        content: 'Note visible',
      },
    ]);
    const readRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(readRequest, findAllHandler));
    expect(readRequest.permissionScope).toBe('OWN');

    const result = await service.findAllByPlayer(1, 100, {
      memberId: readRequest.member!.id,
      scope: 'OWN',
    });
    expect(result.map((n: { id: number }) => n.id)).toEqual([2]);

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(noteCreate).not.toHaveBeenCalled();
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
// player_objective — visibilité PRIVE jamais visible en scope OWN
// ───────────────────────────────────────────────────────────────────────
describe('A8 — scénario multi-rôles (PlayerObjectives)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_objective',
      action: 'READ',
      scope: 'TEAM',
    },
    createTeam: {
      id: 2,
      resource: 'player_objective',
      action: 'CREATE',
      scope: 'TEAM',
    },
    updateTeam: {
      id: 3,
      resource: 'player_objective',
      action: 'UPDATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 4,
      resource: 'player_objective',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: {
      id: 5,
      resource: 'player_objective',
      action: 'READ',
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
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerObjectivesController.prototype.create;
  const findAllHandler = PlayerObjectivesController.prototype.findAll;
  const updateHandler = PlayerObjectivesController.prototype.update;
  const removeHandler = PlayerObjectivesController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerObjectivesService;
  let playerFindFirst: jest.Mock;
  let objectiveCreate: jest.Mock;
  let objectiveFindMany: jest.Mock;
  let objectiveFindFirst: jest.Mock;
  let objectiveUpdate: jest.Mock;
  let objectiveDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    objectiveCreate = jest.fn().mockResolvedValue({ id: 1 });
    objectiveFindMany = jest.fn().mockResolvedValue([]);
    objectiveFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 300 });
    objectiveUpdate = jest.fn().mockResolvedValue({ id: 1 });
    objectiveDelete = jest.fn().mockResolvedValue({ id: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerObjective: {
        create: objectiveCreate,
        findMany: objectiveFindMany,
        findFirst: objectiveFindFirst,
        update: objectiveUpdate,
        delete: objectiveDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    service = new PlayerObjectivesService(prismaStub);
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
      { theme: 'TECHNIQUE', description: 'Résumé', horizon: 'SHORT_TERM' },
      requester,
    );
    expect(objectiveCreate).toHaveBeenCalled();
    await service.update(1, 300, 1, { status: 'ACHIEVED' }, requester);
    expect(objectiveUpdate).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(objectiveDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        requester.memberId,
        { theme: 'TECHNIQUE', description: 'Résumé', horizon: 'SHORT_TERM' },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit ses propres objectifs sans jamais voir les PRIVE, création refusée', async () => {
    objectiveFindMany.mockResolvedValue([
      {
        id: 1,
        playerId: 100,
        visibility: 'PRIVE',
        description: 'Objectif staff',
      },
      {
        id: 2,
        playerId: 100,
        visibility: 'SEMI_PRIVE',
        description: 'Objectif visible',
      },
    ]);
    const readRequest = {
      params: { clubId: '1', playerId: '100' },
      query: { teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await guard.canActivate(buildContext(readRequest, findAllHandler));
    expect(readRequest.permissionScope).toBe('OWN');

    const result = await service.findAllByPlayer(1, 100, {
      memberId: readRequest.member!.id,
      scope: 'OWN',
    });
    expect(result.map((o: { id: number }) => o.id)).toEqual([2]);

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(objectiveCreate).not.toHaveBeenCalled();
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
// player_evaluation — session multi-critères, pas de champ visibility
// ───────────────────────────────────────────────────────────────────────
describe('A8 — scénario multi-rôles (PlayerEvaluations)', () => {
  const permissions = {
    readTeam: {
      id: 1,
      resource: 'player_evaluation',
      action: 'READ',
      scope: 'TEAM',
    },
    createTeam: {
      id: 2,
      resource: 'player_evaluation',
      action: 'CREATE',
      scope: 'TEAM',
    },
    updateTeam: {
      id: 3,
      resource: 'player_evaluation',
      action: 'UPDATE',
      scope: 'TEAM',
    },
    deleteTeam: {
      id: 4,
      resource: 'player_evaluation',
      action: 'DELETE',
      scope: 'TEAM',
    },
    readOwn: {
      id: 5,
      resource: 'player_evaluation',
      action: 'READ',
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
      rolePermissions: [{ permission: permissions.readOwn }],
    },
    parent: { id: 3, isSystem: true, rolePermissions: [] },
  };

  /* eslint-disable @typescript-eslint/unbound-method */
  const createHandler = PlayerEvaluationsController.prototype.create;
  const findAllHandler = PlayerEvaluationsController.prototype.findAll;
  const updateHandler = PlayerEvaluationsController.prototype.update;
  const removeHandler = PlayerEvaluationsController.prototype.remove;
  /* eslint-enable @typescript-eslint/unbound-method */

  let guard: PermissionsGuard;
  let service: PlayerEvaluationsService;
  let playerFindFirst: jest.Mock;
  let criterionCount: jest.Mock;
  let evaluationCreate: jest.Mock;
  let evaluationFindMany: jest.Mock;
  let evaluationFindFirst: jest.Mock;
  let evaluationUpdate: jest.Mock;
  let evaluationDelete: jest.Mock;
  let scoreDeleteMany: jest.Mock;
  let playerTeamFindFirst: jest.Mock;

  beforeEach(() => {
    guard = buildGuard(roles);
    playerFindFirst = findPlayerAmong([
      marcPlayerProfile,
      teammateProfile,
      outsiderProfile,
    ]);
    criterionCount = jest.fn().mockResolvedValue(1);
    evaluationCreate = jest.fn().mockResolvedValue({ id: 1 });
    evaluationFindMany = jest.fn().mockResolvedValue([]);
    evaluationFindFirst = jest.fn().mockResolvedValue({ id: 1, playerId: 300 });
    evaluationUpdate = jest.fn().mockResolvedValue({ id: 1 });
    evaluationDelete = jest.fn().mockResolvedValue({ id: 1 });
    scoreDeleteMany = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      evaluationCriterion: { count: criterionCount },
      playerEvaluation: {
        create: evaluationCreate,
        findMany: evaluationFindMany,
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
    service = new PlayerEvaluationsService(prismaStub);
  });

  it('Coach (équipe 5) : CRUD complet (session multi-critères) sur un coéquipier, refusé pour un joueur hors équipe même avec sa propre équipe en query', async () => {
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
      { date: new Date('2026-06-01'), scores: [{ criterionId: 1, score: 8 }] },
      requester,
    );
    expect(evaluationCreate).toHaveBeenCalled();
    await service.update(
      1,
      300,
      1,
      { scores: [{ criterionId: 1, score: 9 }] },
      requester,
    );
    expect(evaluationUpdate).toHaveBeenCalled();
    await service.remove(1, 300, 1, requester);
    expect(evaluationDelete).toHaveBeenCalled();

    playerTeamFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(
        1,
        400,
        requester.memberId,
        {
          date: new Date('2026-06-01'),
          scores: [{ criterionId: 1, score: 8 }],
        },
        requester,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (équipe 8, profil 100) : lit ses propres évaluations, création refusée par le guard', async () => {
    evaluationFindMany.mockResolvedValue([
      { id: 1, playerId: 100, scores: [{ criterionId: 1, score: 7 }] },
    ]);
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
    expect(evaluationFindMany).toHaveBeenCalled();

    const createRequest = {
      params: { clubId: '1', playerId: '100' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(createRequest, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(evaluationCreate).not.toHaveBeenCalled();
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
