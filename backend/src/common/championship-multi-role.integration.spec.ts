import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  Championship,
  ChampionshipMatch,
  ChampionshipParticipant,
  ExternalTeam,
  Member,
} from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

import { ChampionshipsController } from '../championships/championships.controller';
import { ChampionshipsService } from '../championships/championships.service';
import { ChampionshipParticipantsController } from '../championship-participants/championship-participants.controller';
import { ChampionshipParticipantsService } from '../championship-participants/championship-participants.service';
import { ChampionshipMatchesController } from '../championship-matches/championship-matches.controller';
import { ChampionshipMatchesService } from '../championship-matches/championship-matches.service';
import { ExternalTeamsController } from '../external-teams/external-teams.controller';
import { ExternalTeamsService } from '../external-teams/external-teams.service';

/**
 * B15 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), appliqué au module
 * Championship (Partie B), miroir de `season-multi-role.integration.spec.ts`
 * (A13/A19) et `calendrier-multi-role.integration.spec.ts` (B9). Même
 * persona canonique "Marc" : Coach équipe 5 (U15, Club 1), Player équipe 8
 * (Seniors, Club 1), Parent d'un enfant équipe 12 (U10, Club 2).
 *
 * Contrairement à `season` (écriture réservée à AdminClub depuis A14),
 * `championship`/`championship_participant`/`championship_match`/
 * `external_team` restent en CRUD complet scope TEAM pour le Coach
 * (décision B0 du plan — chaque Coach gère le(s) championnat(s) de sa
 * propre équipe). Le scénario exerce donc le flux réel complet, pas
 * seulement le guard :
 *
 * 1. Coach (équipe 5) : crée une équipe adverse (`external_team`, route
 *    club-only via `?teamId=`), crée un championnat pour son équipe (son
 *    équipe est ajoutée automatiquement comme participante, B19), ajoute
 *    l'équipe adverse comme second participant, planifie une rencontre,
 *    saisit un résultat (FINISHED), lit le
 *    classement calculé — vérifie que sa propre équipe est 1ère. Refusé en
 *    écriture sur l'équipe 8 (il n'y est que Player).
 * 2. Player (équipe 8) : lit le classement/les rencontres/les participants
 *    de SA propre équipe (scope TEAM, READ seul, `canManage=false`),
 *    écriture refusée par le guard sur les 4 ressources.
 * 3. Parent (Club 2) : aucun accès à aucune des 4 ressources, quelle que
 *    soit l'action.
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
// memberId 55 = Marc (Club 2) : Parent, MemberRole équipe 12 — le rôle
// Parent n'a aucune permission sur les 4 ressources Championship (voir
// backend/prisma/seed.ts B0), vérifié explicitement plutôt que supposé.
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

function buildPermissionsService(roles: ResourceRoles) {
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
  return new PermissionsService(permissionsPrismaStub);
}

function buildGuard(roles: ResourceRoles) {
  const permissionsService = buildPermissionsService(roles);

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

// Rôles réels du seed (backend/prisma/seed.ts) : Coach CRUD complet scope
// TEAM sur les 4 ressources ; Player READ seul scope TEAM sur les 3
// ressources championnat (pas `external_team`, aucun besoin de consulter le
// carnet d'adresses hors contexte d'un championnat) ; Parent aucune
// permission.
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
  participantCreateTeam: {
    id: 3,
    resource: 'championship_participant',
    action: 'CREATE',
    scope: 'TEAM',
  },
  participantReadTeam: {
    id: 4,
    resource: 'championship_participant',
    action: 'READ',
    scope: 'TEAM',
  },
  matchCreateTeam: {
    id: 5,
    resource: 'championship_match',
    action: 'CREATE',
    scope: 'TEAM',
  },
  matchUpdateTeam: {
    id: 6,
    resource: 'championship_match',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  matchReadTeam: {
    id: 7,
    resource: 'championship_match',
    action: 'READ',
    scope: 'TEAM',
  },
  externalTeamCreateTeam: {
    id: 8,
    resource: 'external_team',
    action: 'CREATE',
    scope: 'TEAM',
  },
} as const;

const roles: ResourceRoles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.championshipCreateTeam },
      { permission: permissions.championshipReadTeam },
      { permission: permissions.participantCreateTeam },
      { permission: permissions.participantReadTeam },
      { permission: permissions.matchCreateTeam },
      { permission: permissions.matchUpdateTeam },
      { permission: permissions.matchReadTeam },
      { permission: permissions.externalTeamCreateTeam },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.championshipReadTeam },
      { permission: permissions.participantReadTeam },
      { permission: permissions.matchReadTeam },
    ],
  },
  parent: { id: 3, isSystem: true, rolePermissions: [] },
};

/* eslint-disable @typescript-eslint/unbound-method */
const championshipCreateHandler = ChampionshipsController.prototype.create;
const championshipFindAllHandler = ChampionshipsController.prototype.findAll;
const championshipStandingsHandler =
  ChampionshipsController.prototype.getStandings;
const participantCreateHandler =
  ChampionshipParticipantsController.prototype.create;
const participantFindAllHandler =
  ChampionshipParticipantsController.prototype.findAll;
const matchCreateHandler = ChampionshipMatchesController.prototype.create;
const matchUpdateHandler = ChampionshipMatchesController.prototype.update;
const matchFindAllHandler = ChampionshipMatchesController.prototype.findAll;
const externalTeamCreateHandler = ExternalTeamsController.prototype.create;
const externalTeamFindAllHandler = ExternalTeamsController.prototype.findAll;
/* eslint-enable @typescript-eslint/unbound-method */

describe('B15 — scénario multi-rôles bout-en-bout (module Championship)', () => {
  let guard: PermissionsGuard;
  let championshipsService: ChampionshipsService;
  let participantsService: ChampionshipParticipantsService;
  let matchesService: ChampionshipMatchesService;
  let externalTeamsService: ExternalTeamsService;

  let externalTeamsStore: ExternalTeam[];
  let championshipsStore: Championship[];
  let participantsStore: ChampionshipParticipant[];
  let matchesStore: ChampionshipMatch[];
  let nextId: number;

  beforeEach(() => {
    guard = buildGuard(roles);
    const permissionsService = buildPermissionsService(roles);

    externalTeamsStore = [];
    championshipsStore = [];
    participantsStore = [];
    matchesStore = [];
    nextId = 1;

    const teamsById: Record<number, { id: number; clubId: number }> = {
      5: { id: 5, clubId: 1 },
      8: { id: 8, clubId: 1 },
      12: { id: 12, clubId: 2 },
    };
    const seasonsById: Record<number, { id: number; clubId: number }> = {
      10: { id: 10, clubId: 1 },
    };

    const participantSelect = (p: ChampionshipParticipant) => ({
      id: p.id,
      internalTeam:
        p.internalTeamId !== null
          ? { id: p.internalTeamId, name: 'U15' }
          : null,
      externalTeam:
        p.externalTeamId !== null
          ? {
              id: p.externalTeamId,
              name:
                externalTeamsStore.find((e) => e.id === p.externalTeamId)
                  ?.name ?? '?',
            }
          : null,
    });

    const prismaStub = {
      team: {
        findFirst: jest.fn(
          ({ where }: { where: { id: number; clubId: number } }) =>
            Promise.resolve(
              teamsById[where.id]?.clubId === where.clubId
                ? teamsById[where.id]
                : null,
            ),
        ),
      },
      season: {
        findFirst: jest.fn(
          ({ where }: { where: { id: number; clubId: number } }) =>
            Promise.resolve(
              seasonsById[where.id]?.clubId === where.clubId
                ? seasonsById[where.id]
                : null,
            ),
        ),
      },
      externalTeam: {
        create: jest.fn(({ data }: { data: Partial<ExternalTeam> }) => {
          const externalTeam = { id: nextId++, ...data } as ExternalTeam;
          externalTeamsStore.push(externalTeam);
          return Promise.resolve(externalTeam);
        }),
        findFirst: jest.fn(
          ({ where }: { where: { id: number; clubId: number } }) =>
            Promise.resolve(
              externalTeamsStore.find(
                (e) => e.id === where.id && e.clubId === where.clubId,
              ) ?? null,
            ),
        ),
        findMany: jest.fn(({ where }: { where: { clubId: number } }) =>
          Promise.resolve(
            externalTeamsStore.filter((e) => e.clubId === where.clubId),
          ),
        ),
      },
      championship: {
        create: jest.fn(({ data }: { data: Partial<Championship> }) => {
          const championship = { id: nextId++, ...data } as Championship;
          championshipsStore.push(championship);
          return Promise.resolve(championship);
        }),
        findMany: jest.fn(({ where }: { where: { teamId: number } }) =>
          Promise.resolve(
            championshipsStore.filter((c) => c.teamId === where.teamId),
          ),
        ),
        findFirst: jest.fn(
          ({ where }: { where: { id: number; teamId: number } }) =>
            Promise.resolve(
              championshipsStore.find(
                (c) => c.id === where.id && c.teamId === where.teamId,
              ) ?? null,
            ),
        ),
      },
      championshipParticipant: {
        create: jest.fn(
          ({ data }: { data: Partial<ChampionshipParticipant> }) => {
            const participant = {
              id: nextId++,
              ...data,
            } as ChampionshipParticipant;
            participantsStore.push(participant);
            return Promise.resolve(participantSelect(participant));
          },
        ),
        findMany: jest.fn(({ where }: { where: { championshipId: number } }) =>
          Promise.resolve(
            participantsStore
              .filter((p) => p.championshipId === where.championshipId)
              .map(participantSelect),
          ),
        ),
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: {
              id?: number;
              championshipId: number;
              internalTeamId?: number;
              externalTeamId?: number;
            };
          }) =>
            Promise.resolve(
              participantsStore.find(
                (p) =>
                  (where.id === undefined || p.id === where.id) &&
                  p.championshipId === where.championshipId &&
                  (where.internalTeamId === undefined ||
                    p.internalTeamId === where.internalTeamId) &&
                  (where.externalTeamId === undefined ||
                    p.externalTeamId === where.externalTeamId),
              ) ?? null,
            ),
        ),
      },
      championshipMatch: {
        create: jest.fn(({ data }: { data: Partial<ChampionshipMatch> }) => {
          const match = {
            id: nextId++,
            status: 'SCHEDULED',
            scoreHome: null,
            scoreAway: null,
            ...data,
          } as ChampionshipMatch;
          matchesStore.push(match);
          return Promise.resolve(match);
        }),
        findMany: jest.fn(({ where }: { where: { championshipId: number } }) =>
          Promise.resolve(
            matchesStore.filter(
              (m) => m.championshipId === where.championshipId,
            ),
          ),
        ),
        findFirst: jest.fn(
          ({ where }: { where: { id?: number; championshipId: number } }) =>
            Promise.resolve(
              matchesStore.find(
                (m) =>
                  (where.id === undefined || m.id === where.id) &&
                  m.championshipId === where.championshipId,
              ) ?? null,
            ),
        ),
        update: jest.fn(
          ({
            where: { id },
            data,
          }: {
            where: { id: number };
            data: Partial<ChampionshipMatch>;
          }) => {
            const match = matchesStore.find((m) => m.id === id)!;
            Object.assign(
              match,
              Object.fromEntries(
                Object.entries(data).filter(([, v]) => v !== undefined),
              ),
            );
            return Promise.resolve(match);
          },
        ),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    championshipsService = new ChampionshipsService(
      prismaStub,
      permissionsService,
    );
    participantsService = new ChampionshipParticipantsService(
      prismaStub,
      permissionsService,
    );
    matchesService = new ChampionshipMatchesService(
      prismaStub,
      permissionsService,
    );
    externalTeamsService = new ExternalTeamsService(
      prismaStub,
      permissionsService,
    );
  });

  it('Coach (Marc, équipe 5) : gère un championnat de bout en bout — équipe adverse, championnat, participants, rencontre, résultat, classement', async () => {
    // 1. Équipe adverse — route club-only, `?teamId=5` requis pour un Coach.
    const externalTeamRequest = {
      params: { clubId: '1' },
      query: { teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(
        buildContext(externalTeamRequest, externalTeamCreateHandler),
      ),
    ).resolves.toBe(true);
    const externalTeam = await externalTeamsService.create(1, {
      name: 'FC Rivaux',
    });

    // 2. Championnat pour l'équipe 5.
    const championshipRequest = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(
        buildContext(championshipRequest, championshipCreateHandler),
      ),
    ).resolves.toBe(true);
    expect(championshipRequest.permissionScope).toBe('TEAM');
    const championship = await championshipsService.create(1, 5, {
      seasonId: 10,
      name: 'Championnat Automne',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });

    // 3. Participants — l'équipe 5 elle-même est déjà participante (ajoutée
    // automatiquement à la création du championnat, B19) ; seule l'équipe
    // adverse créée ci-dessus reste à ajouter manuellement.
    const participantRequest = {
      params: {
        clubId: '1',
        teamId: '5',
        championshipId: String(championship.id),
      },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(
        buildContext(participantRequest, participantCreateHandler),
      ),
    ).resolves.toBe(true);
    const { data: existingParticipants } =
      await participantsService.findAllByChampionship(
        1,
        5,
        championship.id,
        42,
      );
    const homeParticipant = existingParticipants.find(
      (p) => p.internalTeam?.id === 5,
    )!;
    const awayParticipant = await participantsService.create(
      1,
      5,
      championship.id,
      { externalTeamId: externalTeam.id },
    );

    // 4. Rencontre planifiée puis résultat saisi (SCHEDULED → FINISHED).
    const matchRequest = {
      params: {
        clubId: '1',
        teamId: '5',
        championshipId: String(championship.id),
      },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(matchRequest, matchCreateHandler)),
    ).resolves.toBe(true);
    const match = await matchesService.create(1, 5, championship.id, {
      homeParticipantId: homeParticipant.id,
      awayParticipantId: awayParticipant.id,
      scheduledAt: new Date('2026-09-15T14:00:00.000Z'),
    });

    await expect(
      guard.canActivate(buildContext(matchRequest, matchUpdateHandler)),
    ).resolves.toBe(true);
    await matchesService.update(1, 5, championship.id, match.id, {
      status: 'FINISHED',
      scoreHome: 3,
      scoreAway: 1,
    });

    // 5. Classement — l'équipe interne (victoire 3-1) doit être 1ère.
    await expect(
      guard.canActivate(
        buildContext(championshipRequest, championshipStandingsHandler),
      ),
    ).resolves.toBe(true);
    const standings = await championshipsService.getStandings(
      1,
      5,
      championship.id,
    );
    expect(standings[0].participantId).toBe(homeParticipant.id);
    expect(standings[0].points).toBe(3);
    expect(standings[1].participantId).toBe(awayParticipant.id);
    expect(standings[1].points).toBe(0);

    // 6. Refusé sur l'équipe 8 — Marc n'y est que Player.
    const writeOnPlayerTeam = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(
        buildContext(writeOnPlayerTeam, championshipCreateHandler),
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (Marc, équipe 8) : lit championnats/participants/rencontres de sa propre équipe (canManage=false), écriture refusée par le guard', async () => {
    // Un championnat pré-existant sur l'équipe 8, mis en place directement
    // (Marc n'a jamais pu le créer lui-même en tant que Player).
    championshipsStore.push({
      id: 900,
      seasonId: 10,
      teamId: 8,
      name: 'Championnat Seniors',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakerRules: ['GOAL_DIFFERENCE'],
      tiebreakerPreset: null,
      numberOfPeriods: 2,
      periodDurationMinutes: 45,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const readRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, championshipFindAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');
    const { data: championships, canManage } =
      await championshipsService.findAllByTeam(1, 8, 42);
    expect(championships.map((c) => c.id)).toEqual([900]);
    expect(canManage).toBe(false);

    await expect(
      guard.canActivate(buildContext(readRequest, participantFindAllHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(buildContext(readRequest, matchFindAllHandler)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildContext(readRequest, championshipStandingsHandler),
      ),
    ).resolves.toBe(true);
    const standings = await championshipsService.getStandings(1, 8, 900);
    expect(standings).toEqual([]);

    // Même personne, même club, mais son seul rôle sur l'équipe 8 est Player
    // (READ seul) : écriture refusée sur les 3 ressources championnat.
    const writeRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeRequest, championshipCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, participantCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, matchCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    // `external_team` n'est même pas accordé en lecture au Player (décision
    // B0 — pas de besoin de consulter le carnet d'adresses hors contexte
    // d'un championnat).
    await expect(
      guard.canActivate(
        buildContext(
          { ...readRequest, params: { clubId: '1' }, query: { teamId: '8' } },
          externalTeamFindAllHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Parent (Marc, Club 2) : aucun accès aux 4 ressources Championship, quelle que soit l’action', async () => {
    const request = {
      params: { clubId: '2', teamId: '12' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, championshipFindAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, championshipCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, participantFindAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, participantCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, matchFindAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, matchCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(
        buildContext(
          {
            params: { clubId: '2' },
            query: { teamId: '12' },
            user: { userId: 71 },
          },
          externalTeamFindAllHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(
        buildContext(
          {
            params: { clubId: '2' },
            query: { teamId: '12' },
            user: { userId: 71 },
          },
          externalTeamCreateHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
