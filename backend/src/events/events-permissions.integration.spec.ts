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
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * Scénario multi-rôles (docs/modules/auth-roles.md) appliqué au module
 * Calendrier (étape B2) : un Coach gère les événements de ses équipes
 * (scope TEAM), un AdminClub gère tout le club (scope CLUB), un Player ne
 * peut que consulter le calendrier de son équipe (scope TEAM, READ seul —
 * aucune permission CREATE/UPDATE/DELETE ne lui est accordée, voir
 * backend/prisma/seed.ts), un membre sans rôle n'a aucun accès.
 * Contrairement à player_measurement, l'URL porte toujours teamId (même
 * pattern que TeamStaff) : pas de cas "Coach sans teamId" à couvrir ici.
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
  eventCreateTeam: {
    id: 1,
    resource: 'event',
    action: 'CREATE',
    scope: 'TEAM',
  },
  eventReadTeam: { id: 2, resource: 'event', action: 'READ', scope: 'TEAM' },
  eventCreateClub: {
    id: 3,
    resource: 'event',
    action: 'CREATE',
    scope: 'CLUB',
  },
  eventReadClub: { id: 4, resource: 'event', action: 'READ', scope: 'CLUB' },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.eventCreateTeam },
      { permission: permissions.eventReadTeam },
    ],
  },
  adminClub: {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.eventCreateClub },
      { permission: permissions.eventReadClub },
    ],
  },
  player: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.eventReadTeam }],
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
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
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

// eslint-disable-next-line @typescript-eslint/unbound-method
const createHandler = EventsController.prototype.create;
// eslint-disable-next-line @typescript-eslint/unbound-method
const createBulkHandler = EventsController.prototype.createBulk;
// eslint-disable-next-line @typescript-eslint/unbound-method
const findAllHandler = EventsController.prototype.findAll;

describe('Module Calendrier — scénario multi-rôles (EventsController)', () => {
  let guard: PermissionsGuard;
  let eventsService: EventsService;
  let teamFindFirst: jest.Mock;
  let eventFindMany: jest.Mock;
  let eventCreate: jest.Mock;
  let eventCreateMany: jest.Mock;

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
    eventFindMany = jest.fn().mockResolvedValue([]);
    eventCreate = jest.fn().mockResolvedValue({ id: 900 });
    eventCreateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
      event: {
        findMany: eventFindMany,
        create: eventCreate,
        createMany: eventCreateMany,
      },
    } as unknown as PrismaService;
    eventsService = new EventsService(
      prismaStub,
      membersService,
      permissionsService,
    );
  });

  it('Coach crée un événement pour sa propre équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await eventsService.create(1, 5, {
      type: 'TRAINING',
      title: 'Entraînement',
      startAt: new Date('2026-07-10T18:00:00Z'),
    });
    expect(eventCreate).toHaveBeenCalled();
  });

  it("Coach n'a aucun droit pour créer un événement sur une AUTRE équipe", async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('Coach crée une série d’événements récurrents pour sa propre équipe', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 71 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await eventsService.createBulk(1, 5, [
      {
        type: 'TRAINING',
        title: 'Entraînement',
        startAt: new Date('2026-07-06T17:30:00Z'),
      },
      {
        type: 'TRAINING',
        title: 'Entraînement',
        startAt: new Date('2026-07-08T17:30:00Z'),
      },
    ]);
    expect(eventCreateMany).toHaveBeenCalled();
  });

  it("Player n'a pas la permission de créer une série récurrente", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createBulkHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(eventCreateMany).not.toHaveBeenCalled();
  });

  it('AdminClub crée un événement pour n’importe quelle équipe du club', async () => {
    const request = {
      params: { clubId: '1', teamId: '6' },
      user: { userId: 70 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('CLUB');
  });

  it('Player consulte le calendrier de son équipe (READ seul)', async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, findAllHandler)),
    ).resolves.toBe(true);
    expect(request.permissionScope).toBe('TEAM');

    await expect(eventsService.findAllByTeam(1, 5, {})).resolves.toEqual([]);
  });

  it("Player n'a pas la permission de créer un événement", async () => {
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request, createHandler)),
    ).rejects.toBeInstanceOf(AppException);
    expect(eventCreate).not.toHaveBeenCalled();
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

  // "Mes événements" (B3) : pas de PermissionsGuard/@RequirePermission sur
  // cette route (voir EventsMineController), donc exercée directement via
  // EventsService.findMineInClub avec le vrai PermissionsService construit
  // ci-dessus — pas seulement le guard.
  describe('findMineInClub — agrégation multi-équipes', () => {
    const expectedFindManyArgs = (team: object) => ({
      where: {
        team,
        type: undefined,
        startAt: { gte: undefined, lte: undefined },
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { startAt: 'asc' },
    });

    it('AdminClub (scope CLUB) voit les événements de toutes les équipes du club', async () => {
      await eventsService.findMineInClub(1, 70);

      expect(eventFindMany).toHaveBeenCalledWith(
        expectedFindManyArgs({ clubId: 1 }),
      );
    });

    it('Coach (scope TEAM) ne voit que les événements de ses propres équipes', async () => {
      await eventsService.findMineInClub(1, 71);

      expect(eventFindMany).toHaveBeenCalledWith(
        expectedFindManyArgs({
          clubId: 1,
          memberRoles: { some: { memberId: 43, teamId: { not: null } } },
        }),
      );
    });

    it('Player (scope TEAM, READ seul) ne voit que les événements de ses propres équipes', async () => {
      await eventsService.findMineInClub(1, 7);

      expect(eventFindMany).toHaveBeenCalledWith(
        expectedFindManyArgs({
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        }),
      );
    });

    it("un membre du club sans aucun rôle voit un calendrier vide (pas d'erreur)", async () => {
      await eventsService.findMineInClub(1, 500);

      expect(eventFindMany).toHaveBeenCalledWith(
        expectedFindManyArgs({
          clubId: 1,
          memberRoles: { some: { memberId: 1000, teamId: { not: null } } },
        }),
      );
    });
  });
});
