import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

import { MatchAttendancesController } from '../match-attendances/match-attendances.controller';
import { MatchAttendancesService } from '../match-attendances/match-attendances.service';
import { MatchLineupsController } from '../match-lineups/match-lineups.controller';
import { MatchLineupsService } from '../match-lineups/match-lineups.service';

/**
 * B5 — scénario multi-rôles bout-en-bout (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire"), clôture de la Partie B du
 * module Matchs (Phase 4). Miroir de `matchs-fondations-multi-role
 * .integration.spec.ts` (A6), même persona canonique "Marc" : Coach équipe 5
 * (Club 1), Player équipe 8 (Club 1), Parent d'un enfant équipe 12 (Club 2).
 * Distinct des `*-permissions.integration.spec.ts` par module (B1/B2, un
 * utilisateur par rôle) : ici un seul et même membre cumule les 3 rôles dans
 * des scopes distincts, le cas que le guard seul ne suffit pas à couvrir.
 *
 * 1. Coach (équipe 5) : convoque des joueurs, modifie librement le statut de
 *    convocation d'un joueur (y compris un retour à PENDING — capacité
 *    réservée au Coach, jamais à Player/Parent, voir la décision du
 *    2026-07-17 documentée dans docs/modules/matchs.md §Convocations),
 *    ajoute un joueur convoqué à la composition (poste + numéro), retire une
 *    convocation et une ligne de composition. Refusé en écriture sur
 *    l'équipe 8 (il n'y est que Player).
 * 2. Player (équipe 8) : consulte sa propre convocation (scope OWN, filtrée
 *    côté service), y répond, ne peut jamais toucher `attendanceStatus` ni
 *    revenir à PENDING lui-même ; consulte la composition complète de
 *    l'équipe (`match_lineup READ TEAM`, aucun filtrage à sa propre ligne,
 *    contrairement aux convocations) sans pouvoir la modifier.
 * 3. Parent (Club 2) : consulte et répond pour la convocation de son enfant
 *    (scope PARENT), sans accès à la composition (aucun rôle sur
 *    `match_lineup`, refusé dès le guard).
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

// Rôles réels du seed (backend/prisma/seed.ts, A0/B0) : Coach CRUD complet
// scope TEAM sur match_attendance/match_lineup ; Player READ+UPDATE OWN sur
// match_attendance, READ TEAM (non filtré) sur match_lineup ; Parent
// READ+UPDATE PARENT sur match_attendance uniquement — aucun rôle sur
// match_lineup (docs/modules/matchs.md §Droits par rôle).
const permissions = {
  attendanceCreateTeam: {
    id: 1,
    resource: 'match_attendance',
    action: 'CREATE',
    scope: 'TEAM',
  },
  attendanceReadTeam: {
    id: 2,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'TEAM',
  },
  attendanceUpdateTeam: {
    id: 3,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  attendanceDeleteTeam: {
    id: 4,
    resource: 'match_attendance',
    action: 'DELETE',
    scope: 'TEAM',
  },
  attendanceReadOwn: {
    id: 5,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'OWN',
  },
  attendanceUpdateOwn: {
    id: 6,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'OWN',
  },
  attendanceReadParent: {
    id: 7,
    resource: 'match_attendance',
    action: 'READ',
    scope: 'PARENT',
  },
  attendanceUpdateParent: {
    id: 8,
    resource: 'match_attendance',
    action: 'UPDATE',
    scope: 'PARENT',
  },
  lineupCreateTeam: {
    id: 9,
    resource: 'match_lineup',
    action: 'CREATE',
    scope: 'TEAM',
  },
  lineupReadTeam: {
    id: 10,
    resource: 'match_lineup',
    action: 'READ',
    scope: 'TEAM',
  },
  lineupDeleteTeam: {
    id: 11,
    resource: 'match_lineup',
    action: 'DELETE',
    scope: 'TEAM',
  },
} as const;

const roles: ResourceRoles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.attendanceCreateTeam },
      { permission: permissions.attendanceReadTeam },
      { permission: permissions.attendanceUpdateTeam },
      { permission: permissions.attendanceDeleteTeam },
      { permission: permissions.lineupCreateTeam },
      { permission: permissions.lineupReadTeam },
      { permission: permissions.lineupDeleteTeam },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.attendanceReadOwn },
      { permission: permissions.attendanceUpdateOwn },
      { permission: permissions.lineupReadTeam },
    ],
  },
  parent: {
    id: 3,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.attendanceReadParent },
      { permission: permissions.attendanceUpdateParent },
    ],
  },
};

/* eslint-disable @typescript-eslint/unbound-method */
const attendanceCreateBulkHandler =
  MatchAttendancesController.prototype.createBulk;
const attendanceFindAllHandler = MatchAttendancesController.prototype.findAll;
const attendanceUpdateHandler = MatchAttendancesController.prototype.update;
const attendanceRemoveHandler = MatchAttendancesController.prototype.remove;
const lineupUpsertBulkHandler = MatchLineupsController.prototype.upsertBulk;
const lineupFindAllHandler = MatchLineupsController.prototype.findAll;
const lineupRemoveHandler = MatchLineupsController.prototype.remove;
/* eslint-enable @typescript-eslint/unbound-method */

interface AttendanceRow {
  id: number;
  matchId: number;
  playerId: number;
  convocationStatus: string;
  attendanceStatus: string | null;
}

interface LineupRow {
  id: number;
  matchId: number;
  playerId: number;
  lineupStatus: string;
  position: string | null;
  shirtNumber: number | null;
  isCaptain?: boolean;
}

describe('B5 — scénario multi-rôles bout-en-bout (module Matchs, Partie B — convocations & composition)', () => {
  let guard: PermissionsGuard;
  let attendancesService: MatchAttendancesService;
  let lineupsService: MatchLineupsService;

  let attendancesStore: AttendanceRow[];
  let lineupsStore: LineupRow[];
  let nextId: number;

  // Équipe 5 (Club 1, Coach) : match 900, joueur convocable 200.
  // Équipe 8 (Club 1, Player=Marc lui-même) : match 901, PlayerProfile 100
  // (memberId 42 — Marc EST ce joueur).
  // Équipe 12 (Club 2, Parent) : match 902, PlayerProfile 101 (memberId 60 —
  // l'enfant de Marc, lié via ParentChild).
  const teamsById: Record<number, { id: number; clubId: number }> = {
    5: { id: 5, clubId: 1 },
    8: { id: 8, clubId: 1 },
    12: { id: 12, clubId: 2 },
  };
  const matchesById: Record<number, { id: number; teamId: number }> = {
    900: { id: 900, teamId: 5 },
    901: { id: 901, teamId: 8 },
    902: { id: 902, teamId: 12 },
  };
  const playerTeamByPlayerId: Record<number, number> = {
    200: 5,
    100: 8,
    101: 12,
  };
  const playerProfileMemberId: Record<number, number> = {
    200: 900, // joueur générique de l'équipe 5, jamais un requester dans ce test
    100: 42, // Marc lui-même, Player équipe 8
    101: 60, // l'enfant de Marc, équipe 12
  };
  const parentChildLinks: { parentMemberId: number; childMemberId: number }[] =
    [{ parentMemberId: 55, childMemberId: 60 }];

  beforeEach(() => {
    guard = buildGuard(roles);
    const permissionsService = buildPermissionsService(roles);

    attendancesStore = [];
    lineupsStore = [];
    nextId = 1;

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
      match: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { id?: number; event?: { teamId?: number } };
          }) => {
            const match =
              where.id !== undefined ? matchesById[where.id] : undefined;
            if (!match) return Promise.resolve(null);
            if (
              where.event?.teamId !== undefined &&
              match.teamId !== where.event.teamId
            ) {
              return Promise.resolve(null);
            }
            return Promise.resolve({ id: match.id });
          },
        ),
      },
      playerTeam: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { playerId: number; teamId: number; leaveDate: null };
          }) =>
            Promise.resolve(
              playerTeamByPlayerId[where.playerId] === where.teamId
                ? { id: where.playerId }
                : null,
            ),
        ),
      },
      playerProfile: {
        findFirst: jest.fn(({ where }: { where: { memberId: number } }) => {
          const entry = Object.entries(playerProfileMemberId).find(
            ([, memberId]) => memberId === where.memberId,
          );
          return Promise.resolve(entry ? { id: Number(entry[0]) } : null);
        }),
        findMany: jest.fn(
          ({ where }: { where: { memberId: { in: number[] } } }) =>
            Promise.resolve(
              Object.entries(playerProfileMemberId)
                .filter(([, memberId]) => where.memberId.in.includes(memberId))
                .map(([id]) => ({ id: Number(id) })),
            ),
        ),
        findUniqueOrThrow: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve({
            id: where.id,
            memberId: playerProfileMemberId[where.id],
          }),
        ),
      },
      parentChild: {
        findMany: jest.fn(({ where }: { where: { parentMemberId: number } }) =>
          Promise.resolve(
            parentChildLinks.filter(
              (l) => l.parentMemberId === where.parentMemberId,
            ),
          ),
        ),
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: {
              parentMemberId_childMemberId: {
                parentMemberId: number;
                childMemberId: number;
              };
            };
          }) =>
            Promise.resolve(
              parentChildLinks.find(
                (l) =>
                  l.parentMemberId ===
                    where.parentMemberId_childMemberId.parentMemberId &&
                  l.childMemberId ===
                    where.parentMemberId_childMemberId.childMemberId,
              ) ?? null,
            ),
        ),
      },
      matchAttendance: {
        createMany: jest.fn(
          ({ data }: { data: { matchId: number; playerId: number }[] }) => {
            for (const row of data) {
              attendancesStore.push({
                id: nextId++,
                matchId: row.matchId,
                playerId: row.playerId,
                convocationStatus: 'PENDING',
                attendanceStatus: null,
              });
            }
            return Promise.resolve({ count: data.length });
          },
        ),
        findMany: jest.fn(
          ({ where }: { where: { matchId?: number; playerId?: unknown } }) => {
            let rows = attendancesStore;
            if (where.matchId !== undefined) {
              rows = rows.filter((r) => r.matchId === where.matchId);
            }
            if (where.playerId !== undefined) {
              const playerIdWhere = where.playerId as number | { in: number[] };
              rows =
                typeof playerIdWhere === 'number'
                  ? rows.filter((r) => r.playerId === playerIdWhere)
                  : rows.filter((r) => playerIdWhere.in.includes(r.playerId));
            }
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        ),
        findFirst: jest.fn(
          ({ where }: { where: { id: number; matchId: number } }) =>
            Promise.resolve(
              attendancesStore.find(
                (r) => r.id === where.id && r.matchId === where.matchId,
              ) ?? null,
            ),
        ),
        update: jest.fn(
          ({
            where: { id },
            data,
          }: {
            where: { id: number };
            data: Partial<AttendanceRow>;
          }) => {
            const row = attendancesStore.find((r) => r.id === id)!;
            Object.assign(
              row,
              Object.fromEntries(
                Object.entries(data).filter(([, v]) => v !== undefined),
              ),
            );
            return Promise.resolve({ ...row });
          },
        ),
        delete: jest.fn(({ where: { id } }: { where: { id: number } }) => {
          attendancesStore = attendancesStore.filter((r) => r.id !== id);
          return Promise.resolve({ id });
        }),
      },
      matchLineup: {
        upsert: jest.fn(
          ({
            where,
            create,
            update,
          }: {
            where: { matchId_playerId: { matchId: number; playerId: number } };
            create: Omit<LineupRow, 'id'>;
            update: Partial<LineupRow>;
          }) => {
            const existing = lineupsStore.find(
              (r) =>
                r.matchId === where.matchId_playerId.matchId &&
                r.playerId === where.matchId_playerId.playerId,
            );
            if (existing) {
              Object.assign(
                existing,
                Object.fromEntries(
                  Object.entries(update).filter(([, v]) => v !== undefined),
                ),
              );
              return Promise.resolve({ ...existing });
            }
            const row: LineupRow = { id: nextId++, ...create };
            lineupsStore.push(row);
            return Promise.resolve({ ...row });
          },
        ),
        findMany: jest.fn(({ where }: { where: { matchId: number } }) =>
          Promise.resolve(
            lineupsStore
              .filter((r) => r.matchId === where.matchId)
              .map((r) => ({ ...r })),
          ),
        ),
        findFirst: jest.fn(
          ({ where }: { where: { id: number; matchId: number } }) =>
            Promise.resolve(
              lineupsStore.find(
                (r) => r.id === where.id && r.matchId === where.matchId,
              ) ?? null,
            ),
        ),
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: { matchId_playerId: { matchId: number; playerId: number } };
          }) =>
            Promise.resolve(
              lineupsStore.find(
                (r) =>
                  r.matchId === where.matchId_playerId.matchId &&
                  r.playerId === where.matchId_playerId.playerId,
              ) ?? null,
            ),
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: {
              matchId: number;
              isCaptain?: boolean;
              playerId?: { not: number };
            };
            data: Partial<LineupRow>;
          }) => {
            const matches = lineupsStore.filter(
              (r) =>
                r.matchId === where.matchId &&
                (where.isCaptain === undefined ||
                  r.isCaptain === where.isCaptain) &&
                (where.playerId?.not === undefined ||
                  r.playerId !== where.playerId.not),
            );
            for (const row of matches) Object.assign(row, data);
            return Promise.resolve({ count: matches.length });
          },
        ),
        delete: jest.fn(({ where: { id } }: { where: { id: number } }) => {
          lineupsStore = lineupsStore.filter((r) => r.id !== id);
          return Promise.resolve({ id });
        }),
      },
      $transaction: jest.fn(
        (arg: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
          typeof arg === 'function' ? arg(prismaStub) : Promise.all(arg),
      ),
    } as unknown as PrismaService;

    attendancesService = new MatchAttendancesService(
      prismaStub,
      permissionsService,
    );
    lineupsService = new MatchLineupsService(prismaStub, permissionsService);
  });

  it('Coach (Marc, équipe 5) : convoque, modifie librement un statut (y compris retour à PENDING), compose, retire — refusé sur l’équipe 8', async () => {
    const teamRequest = {
      params: { clubId: '1', teamId: '5', matchId: '900' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(teamRequest, attendanceCreateBulkHandler)),
    ).resolves.toBe(true);
    expect(teamRequest.permissionScope).toBe('TEAM');
    const convened = await attendancesService.createBulk(1, 5, 900, [200]);
    expect(convened).toHaveLength(1);
    const attendanceId = convened[0].id;

    // Modification libre du statut, y compris un retour à PENDING — capacité
    // Coach uniquement, jamais Player/Parent (voir test 2 et 3 ci-dessous).
    await expect(
      guard.canActivate(buildContext(teamRequest, attendanceUpdateHandler)),
    ).resolves.toBe(true);
    const accepted = await attendancesService.update(
      1,
      5,
      900,
      attendanceId,
      { convocationStatus: 'ACCEPTED' },
      { memberId: 42, scope: 'TEAM' },
    );
    expect(accepted.convocationStatus).toBe('ACCEPTED');
    const resetToPending = await attendancesService.update(
      1,
      5,
      900,
      attendanceId,
      { convocationStatus: 'PENDING' },
      { memberId: 42, scope: 'TEAM' },
    );
    expect(resetToPending.convocationStatus).toBe('PENDING');

    // Composition : ajoute le joueur convoqué (poste + numéro), retire une
    // convocation puis une ligne de composition.
    await expect(
      guard.canActivate(buildContext(teamRequest, lineupUpsertBulkHandler)),
    ).resolves.toBe(true);
    const { data: lineup } = await lineupsService.upsertBulk(
      1,
      5,
      900,
      [
        {
          playerId: 200,
          lineupStatus: 'TITULAIRE',
          position: 'ST',
          shirtNumber: 9,
        },
      ],
      42,
    );
    expect(lineup).toHaveLength(1);
    expect(lineup[0].position).toBe('ST');

    await expect(
      guard.canActivate(buildContext(teamRequest, attendanceRemoveHandler)),
    ).resolves.toBe(true);
    await attendancesService.remove(1, 5, 900, attendanceId);
    expect(attendancesStore).toHaveLength(0);

    await expect(
      guard.canActivate(buildContext(teamRequest, lineupRemoveHandler)),
    ).resolves.toBe(true);
    await lineupsService.remove(1, 5, 900, lineup[0].id);
    expect(lineupsStore).toHaveLength(0);

    // Refusé sur l'équipe 8 — Marc n'y est que Player.
    const writeOnPlayerTeam = {
      params: { clubId: '1', teamId: '8', matchId: '901' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;
    await expect(
      guard.canActivate(
        buildContext(writeOnPlayerTeam, attendanceCreateBulkHandler),
      ),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(
        buildContext(writeOnPlayerTeam, lineupUpsertBulkHandler),
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Player (Marc, équipe 8) : répond à sa propre convocation (scope OWN), jamais attendanceStatus ni retour à PENDING ; lit toute la composition sans la modifier', async () => {
    attendancesStore.push({
      id: nextId++,
      matchId: 901,
      playerId: 100,
      convocationStatus: 'PENDING',
      attendanceStatus: null,
    });
    lineupsStore.push({
      id: nextId++,
      matchId: 901,
      playerId: 100,
      lineupStatus: 'TITULAIRE',
      position: 'GK',
      shirtNumber: 1,
    });

    const request = {
      params: { clubId: '1', teamId: '8', matchId: '901' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, attendanceFindAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('OWN');
    const { data, canManage } = await attendancesService.findAllByMatch(
      1,
      8,
      901,
      { memberId: 42, scope: 'OWN' },
    );
    expect(data).toHaveLength(1);
    expect(data[0].playerId).toBe(100);
    expect(canManage).toBe(false);

    const attendanceId = data[0].id;
    await expect(
      guard.canActivate(buildContext(request, attendanceUpdateHandler)),
    ).resolves.toBe(true);
    const responded = await attendancesService.update(
      1,
      8,
      901,
      attendanceId,
      { convocationStatus: 'ACCEPTED' },
      { memberId: 42, scope: 'OWN' },
    );
    expect(responded.convocationStatus).toBe('ACCEPTED');

    await expect(
      attendancesService.update(
        1,
        8,
        901,
        attendanceId,
        { attendanceStatus: 'PRESENT' } as never,
        { memberId: 42, scope: 'OWN' },
      ),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      attendancesService.update(
        1,
        8,
        901,
        attendanceId,
        { convocationStatus: 'PENDING' },
        { memberId: 42, scope: 'OWN' },
      ),
    ).rejects.toBeInstanceOf(AppException);

    // Composition : lecture complète (pas de filtrage OWN, contrairement aux
    // convocations), écriture refusée dès le guard.
    await expect(
      guard.canActivate(buildContext(request, lineupFindAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');
    const { data: lineupData, canManage: lineupCanManage } =
      await lineupsService.findAllByMatch(1, 8, 901, 42);
    expect(lineupData).toHaveLength(1);
    expect(lineupCanManage).toBe(false);

    await expect(
      guard.canActivate(buildContext(request, lineupUpsertBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, lineupRemoveHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, attendanceCreateBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Parent (Marc, Club 2) : répond pour la convocation de son enfant (scope PARENT), aucun accès à la composition', async () => {
    attendancesStore.push({
      id: nextId++,
      matchId: 902,
      playerId: 101,
      convocationStatus: 'PENDING',
      attendanceStatus: null,
    });

    const request = {
      params: { clubId: '2', teamId: '12', matchId: '902' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, attendanceFindAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('PARENT');
    const { data } = await attendancesService.findAllByMatch(2, 12, 902, {
      memberId: 55,
      scope: 'PARENT',
    });
    expect(data).toHaveLength(1);
    expect(data[0].playerId).toBe(101);

    const attendanceId = data[0].id;
    await expect(
      guard.canActivate(buildContext(request, attendanceUpdateHandler)),
    ).resolves.toBe(true);
    const responded = await attendancesService.update(
      2,
      12,
      902,
      attendanceId,
      { convocationStatus: 'DECLINED' },
      { memberId: 55, scope: 'PARENT' },
    );
    expect(responded.convocationStatus).toBe('DECLINED');

    await expect(
      attendancesService.update(
        2,
        12,
        902,
        attendanceId,
        { attendanceStatus: 'ABSENT_EXCUSE' } as never,
        { memberId: 55, scope: 'PARENT' },
      ),
    ).rejects.toBeInstanceOf(AppException);

    // Aucun rôle sur match_lineup pour Parent — refusé dès le guard.
    await expect(
      guard.canActivate(buildContext(request, lineupFindAllHandler)),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      guard.canActivate(buildContext(request, attendanceCreateBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
