import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  Championship,
  ChampionshipMatch,
  ChampionshipParticipant,
  Event,
  ExternalTeam,
  Match,
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

import { MatchesController } from '../matches/matches.controller';
import { MatchesService } from '../matches/matches.service';
import { ChampionshipsService } from '../championships/championships.service';
import { ChampionshipParticipantsService } from '../championship-participants/championship-participants.service';
import { ChampionshipMatchesController } from '../championship-matches/championship-matches.controller';
import { ChampionshipMatchesService } from '../championship-matches/championship-matches.service';

/**
 * A6 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), clôture de la Partie A du
 * module Matchs (Phase 4). Miroir de `championship-multi-role.integration
 * .spec.ts` (B15) et `calendrier-multi-role.integration.spec.ts` (B9), même
 * persona canonique "Marc" : Coach équipe 5 (U15, Club 1), Player équipe 8
 * (Seniors, Club 1), Parent d'un enfant équipe 12 (U10, Club 2).
 *
 * Exerce le flux réel complet (guard + PermissionsService + services
 * métier), pas seulement le guard :
 * 1. Coach (équipe 5) : crée un match Amical et un match Coupe directement
 *    (`MatchesService.create`, A2), puis planifie une rencontre de
 *    championnat impliquant son équipe et vérifie la liaison automatique
 *    Event+Match (`ChampionshipMatchesService`, A3) — matchType CHAMPIONNAT,
 *    homeOrAway dérivé, titre = nom de l'adversaire. Refusé en écriture sur
 *    l'équipe 8 (il n'y est que Player).
 * 2. Player (équipe 8) : lit les matchs de sa propre équipe (scope TEAM,
 *    READ seul, `canManage=false`), écriture refusée par le guard.
 * 3. Parent (Club 2) : lit (scope PARENT) les matchs de l'équipe de son
 *    enfant, écriture refusée.
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
// memberId 55 = Marc (Club 2) : Parent, MemberRole équipe 12.
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

// Rôles réels du seed (backend/prisma/seed.ts, A0) : Coach CRUD complet
// scope TEAM sur `match` + CRUD sur les ressources Championship (pour
// exercer la liaison A3) ; Player READ seul scope TEAM ; Parent READ seul
// scope PARENT sur `match` uniquement (résultat de l'enfant, jamais les
// ressources Championship).
const permissions = {
  matchCreateTeam: {
    id: 1,
    resource: 'match',
    action: 'CREATE',
    scope: 'TEAM',
  },
  matchReadTeam: { id: 2, resource: 'match', action: 'READ', scope: 'TEAM' },
  matchReadParent: {
    id: 3,
    resource: 'match',
    action: 'READ',
    scope: 'PARENT',
  },
  championshipCreateTeam: {
    id: 4,
    resource: 'championship',
    action: 'CREATE',
    scope: 'TEAM',
  },
  participantCreateTeam: {
    id: 5,
    resource: 'championship_participant',
    action: 'CREATE',
    scope: 'TEAM',
  },
  championshipMatchCreateTeam: {
    id: 6,
    resource: 'championship_match',
    action: 'CREATE',
    scope: 'TEAM',
  },
  externalTeamCreateTeam: {
    id: 7,
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
      { permission: permissions.matchCreateTeam },
      { permission: permissions.matchReadTeam },
      { permission: permissions.championshipCreateTeam },
      { permission: permissions.participantCreateTeam },
      { permission: permissions.championshipMatchCreateTeam },
      { permission: permissions.externalTeamCreateTeam },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.matchReadTeam }],
  },
  parent: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.matchReadParent }],
  },
};

/* eslint-disable @typescript-eslint/unbound-method */
const matchCreateHandler = MatchesController.prototype.create;
const matchFindAllHandler = MatchesController.prototype.findAll;
const matchUpdateHandler = MatchesController.prototype.update;
const matchRemoveHandler = MatchesController.prototype.remove;
const championshipMatchCreateHandler =
  ChampionshipMatchesController.prototype.create;
/* eslint-enable @typescript-eslint/unbound-method */

describe('A6 — scénario multi-rôles bout-en-bout (module Matchs, Partie A)', () => {
  let guard: PermissionsGuard;
  let matchesService: MatchesService;
  let championshipsService: ChampionshipsService;
  let participantsService: ChampionshipParticipantsService;
  let championshipMatchesService: ChampionshipMatchesService;

  let externalTeamsStore: ExternalTeam[];
  let eventsStore: Event[];
  let matchesStore: Match[];
  let championshipsStore: Championship[];
  let participantsStore: ChampionshipParticipant[];
  let championshipMatchesStore: ChampionshipMatch[];
  let nextId: number;

  const teamsById: Record<number, { id: number; clubId: number }> = {
    5: { id: 5, clubId: 1 },
    8: { id: 8, clubId: 1 },
    12: { id: 12, clubId: 2 },
  };

  beforeEach(() => {
    guard = buildGuard(roles);
    const permissionsService = buildPermissionsService(roles);

    externalTeamsStore = [];
    eventsStore = [];
    matchesStore = [];
    championshipsStore = [];
    participantsStore = [];
    championshipMatchesStore = [];
    nextId = 1;

    const seasonsById: Record<number, { id: number; clubId: number }> = {
      10: { id: 10, clubId: 1 },
    };

    const participantSelect = (p: ChampionshipParticipant) => ({
      id: p.id,
      internalTeamId: p.internalTeamId,
      externalTeamId: p.externalTeamId,
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

    const matchMatchesEventWhere = (
      event: Event,
      eventWhere: { teamId?: number; team?: { clubId?: number } } | undefined,
    ) => {
      if (!eventWhere) return true;
      if (eventWhere.teamId !== undefined && event.teamId !== eventWhere.teamId)
        return false;
      if (
        eventWhere.team?.clubId !== undefined &&
        teamsById[event.teamId]?.clubId !== eventWhere.team.clubId
      ) {
        return false;
      }
      return true;
    };

    const findEventForMatch = (m: Match) =>
      eventsStore.find((e) => e.id === m.eventId)!;

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
      },
      event: {
        create: jest.fn(({ data }: { data: Partial<Event> }) => {
          const event = { id: nextId++, ...data } as Event;
          eventsStore.push(event);
          return Promise.resolve(event);
        }),
        update: jest.fn(
          ({
            where: { id },
            data,
          }: {
            where: { id: number };
            data: Partial<Event>;
          }) => {
            const event = eventsStore.find((e) => e.id === id)!;
            Object.assign(
              event,
              Object.fromEntries(
                Object.entries(data).filter(([, v]) => v !== undefined),
              ),
            );
            return Promise.resolve(event);
          },
        ),
        delete: jest.fn(({ where: { id } }: { where: { id: number } }) => {
          eventsStore = eventsStore.filter((e) => e.id !== id);
          return Promise.resolve({ id });
        }),
      },
      match: {
        create: jest.fn(({ data }: { data: Partial<Match> }) => {
          const match = {
            id: nextId++,
            status: 'SCHEDULED',
            scoreHome: null,
            scoreAway: null,
            ...data,
          } as Match;
          matchesStore.push(match);
          return Promise.resolve(match);
        }),
        findMany: jest.fn(
          ({
            where,
          }: {
            where: {
              event?: { teamId?: number };
              matchType?: string;
              status?: string;
            };
          }) =>
            Promise.resolve(
              matchesStore.filter(
                (m) =>
                  matchMatchesEventWhere(findEventForMatch(m), where.event) &&
                  (where.matchType === undefined ||
                    m.matchType === where.matchType) &&
                  (where.status === undefined || m.status === where.status),
              ),
            ),
        ),
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: {
              id?: number;
              event?: { teamId?: number; team?: { clubId?: number } };
            };
          }) =>
            Promise.resolve(
              matchesStore.find(
                (m) =>
                  (where.id === undefined || m.id === where.id) &&
                  matchMatchesEventWhere(findEventForMatch(m), where.event),
              ) ?? null,
            ),
        ),
        findUnique: jest.fn(
          ({ where }: { where: { championshipMatchId?: number } }) =>
            Promise.resolve(
              matchesStore.find(
                (m) => m.championshipMatchId === where.championshipMatchId,
              ) ?? null,
            ),
        ),
        update: jest.fn(
          ({
            where: { id },
            data,
          }: {
            where: { id: number };
            data: Partial<Match>;
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
        delete: jest.fn(({ where: { id } }: { where: { id: number } }) => {
          matchesStore = matchesStore.filter((m) => m.id !== id);
          return Promise.resolve({ id });
        }),
      },
      championship: {
        create: jest.fn(({ data }: { data: Partial<Championship> }) => {
          const championship = { id: nextId++, ...data } as Championship;
          championshipsStore.push(championship);
          return Promise.resolve(championship);
        }),
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
        findUniqueOrThrow: jest.fn(({ where }: { where: { id: number } }) => {
          const participant = participantsStore.find((p) => p.id === where.id)!;
          return Promise.resolve(participantSelect(participant));
        }),
      },
      championshipMatch: {
        create: jest.fn(({ data }: { data: Partial<ChampionshipMatch> }) => {
          const championshipMatch = {
            id: nextId++,
            status: 'SCHEDULED',
            scoreHome: null,
            scoreAway: null,
            ...data,
          } as ChampionshipMatch;
          championshipMatchesStore.push(championshipMatch);
          return Promise.resolve(championshipMatch);
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    matchesService = new MatchesService(prismaStub, permissionsService);
    championshipsService = new ChampionshipsService(
      prismaStub,
      permissionsService,
    );
    participantsService = new ChampionshipParticipantsService(
      prismaStub,
      permissionsService,
    );
    championshipMatchesService = new ChampionshipMatchesService(
      prismaStub,
      permissionsService,
    );
  });

  it('Coach (Marc, équipe 5) : crée un match Amical et un match Coupe directement, un match Championnat via le module Championnat (liaison A3) — refusé sur l’équipe 8', async () => {
    const teamRequest = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    // 1. Adversaire créé une fois, réutilisé pour les deux matchs directs.
    const externalTeam: ExternalTeam = {
      id: nextId++,
      clubId: 1,
      name: 'FC Rivaux',
      city: null,
      country: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    externalTeamsStore.push(externalTeam);

    // 2. Match Amical direct (A2).
    await expect(
      guard.canActivate(buildContext(teamRequest, matchCreateHandler)),
    ).resolves.toBe(true);
    expect(teamRequest.permissionScope).toBe('TEAM');
    const amical = await matchesService.create(1, 5, {
      title: 'Amical vs FC Rivaux',
      startAt: new Date('2026-08-01T18:00:00.000Z'),
      matchType: 'AMICAL',
      opponentExternalTeamId: externalTeam.id,
      homeOrAway: 'HOME',
    });
    expect(amical.matchType).toBe('AMICAL');

    // 3. Match Coupe direct, avec phase (A2).
    const coupe = await matchesService.create(1, 5, {
      title: 'Coupe vs FC Rivaux',
      startAt: new Date('2026-08-08T18:00:00.000Z'),
      matchType: 'COUPE',
      opponentExternalTeamId: externalTeam.id,
      cupRound: 'ROUND_OF_16',
      homeOrAway: 'AWAY',
    });
    expect(coupe.cupRound).toBe('ROUND_OF_16');

    // 4. Match Championnat — jamais créé directement (A2 le rejette) : naît
    // d'un ChampionshipMatch planifié dans le module Championnat (A3).
    const championship = await championshipsService.create(1, 5, {
      seasonId: 10,
      name: 'Championnat Automne',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });
    const homeParticipant = participantsStore.find(
      (p) => p.championshipId === championship.id && p.internalTeamId === 5,
    )!;
    const awayParticipant = await participantsService.create(
      1,
      5,
      championship.id,
      {
        externalTeamId: externalTeam.id,
      },
    );

    await expect(
      guard.canActivate(
        buildContext(
          {
            ...teamRequest,
            params: {
              ...teamRequest.params,
              championshipId: String(championship.id),
            },
          },
          championshipMatchCreateHandler,
        ),
      ),
    ).resolves.toBe(true);
    await championshipMatchesService.create(1, 5, championship.id, {
      homeParticipantId: homeParticipant.id,
      awayParticipantId: awayParticipant.id,
      scheduledAt: new Date('2026-09-15T14:00:00.000Z'),
    });

    // Liaison A3 : Event+Match créés automatiquement, notre équipe (home)
    // est bien HOME, titre = nom de l'adversaire, jamais de texte en dur.
    const linkedMatch = matchesStore.find((m) => m.matchType === 'CHAMPIONNAT');
    expect(linkedMatch).toBeDefined();
    expect(linkedMatch!.homeOrAway).toBe('HOME');
    const linkedEvent = eventsStore.find((e) => e.id === linkedMatch!.eventId);
    expect(linkedEvent?.title).toBe('FC Rivaux');
    expect(linkedEvent?.teamId).toBe(5);

    // 5. Refusé sur l'équipe 8 — Marc n'y est que Player.
    const writeOnPlayerTeam = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeOnPlayerTeam, matchCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (Marc, équipe 8) : lit les matchs de sa propre équipe (canManage=false), écriture refusée par le guard', async () => {
    // Match préexistant sur l'équipe 8, mis en place directement (Marc n'a
    // jamais pu le créer lui-même en tant que Player).
    const event: Event = {
      id: nextId++,
      teamId: 8,
      type: 'MATCH',
      title: 'FC Adverse',
      startAt: new Date('2026-08-01T18:00:00.000Z'),
      endAt: null,
      location: null,
      description: null,
      isRecurring: false,
      recurringGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    eventsStore.push(event);
    matchesStore.push({
      id: nextId++,
      eventId: event.id,
      championshipMatchId: null,
      matchType: 'AMICAL',
      opponentExternalTeamId: null,
      cupRound: null,
      homeOrAway: 'HOME',
      status: 'SCHEDULED',
      numberOfPeriods: null,
      periodDurationMinutes: null,
      scoreHome: null,
      scoreAway: null,
      globalRating: null,
      globalComment: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const readRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, matchFindAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('TEAM');

    const { data, canManage } = await matchesService.findAllByTeam(1, 8, 42);
    expect(data).toHaveLength(1);
    expect(canManage).toBe(false);

    const writeRequest = {
      params: { clubId: '1', teamId: '8' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeRequest, matchCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, matchUpdateHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(writeRequest, matchRemoveHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Parent (Marc, Club 2) : lit (scope PARENT) les matchs de l’équipe de son enfant, écriture refusée', async () => {
    const event: Event = {
      id: nextId++,
      teamId: 12,
      type: 'MATCH',
      title: 'FC Voisin',
      startAt: new Date('2026-08-01T18:00:00.000Z'),
      endAt: null,
      location: null,
      description: null,
      isRecurring: false,
      recurringGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    eventsStore.push(event);
    matchesStore.push({
      id: nextId++,
      eventId: event.id,
      championshipMatchId: null,
      matchType: 'AMICAL',
      opponentExternalTeamId: null,
      cupRound: null,
      homeOrAway: 'HOME',
      status: 'SCHEDULED',
      numberOfPeriods: null,
      periodDurationMinutes: null,
      scoreHome: null,
      scoreAway: null,
      globalRating: null,
      globalComment: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const readRequest = {
      params: { clubId: '2', teamId: '12' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(readRequest, matchFindAllHandler)),
    ).resolves.toBe(true);
    expect(readRequest.permissionScope).toBe('PARENT');

    const { data } = await matchesService.findAllByTeam(2, 12, 55);
    expect(data).toHaveLength(1);

    const writeRequest = {
      params: { clubId: '2', teamId: '12' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(buildContext(writeRequest, matchCreateHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
