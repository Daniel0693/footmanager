import { HttpStatus } from '@nestjs/common';
import type { Team } from '@prisma/client';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RosterService } from './roster.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function playerTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 200,
    playerId: 100,
    teamId: 5,
    jerseyNumber: 9,
    mainPosition: 'ST',
    secondaryPositions: [],
    joinDate: null,
    leaveDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    player: {
      id: 100,
      memberId: 42,
      member: {
        id: 42,
        firstName: 'Karim',
        lastName: 'Benali',
        phone: '0600000000',
        birthDate: new Date('2011-03-04'),
        user: { email: 'karim@example.com' },
      },
    },
    ...overrides,
  };
}

function teamStaffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 300,
    teamId: 5,
    memberId: 7,
    staffRole: 'PRINCIPAL',
    startDate: null,
    endDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    member: {
      id: 7,
      firstName: 'Alice',
      lastName: 'Admin',
      phone: null,
      birthDate: null,
      user: { email: 'alice@example.com' },
    },
    ...overrides,
  };
}

describe('RosterService', () => {
  let teamFindFirst: jest.Mock;
  let ptFindMany: jest.Mock;
  let tsFindMany: jest.Mock;
  let can: jest.Mock;
  let service: RosterService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    ptFindMany = jest.fn().mockResolvedValue([]);
    tsFindMany = jest.fn().mockResolvedValue([]);
    can = jest.fn().mockResolvedValue('TEAM');

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findMany: ptFindMany },
      teamStaff: { findMany: tsFindMany },
    } as unknown as PrismaService;
    const permissionsStub = { can } as unknown as PermissionsService;

    service = new RosterService(prismaStub, permissionsStub);
  });

  const requester = { memberId: 1, clubId: 1, teamId: 5 };

  it("refuse si l'équipe n'appartient pas au club", async () => {
    teamFindFirst.mockResolvedValue(null);

    await expect(service.findAllByTeam(requester)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('fusionne joueurs et staff en un seul tableau (statut ACTIVE par défaut)', async () => {
    ptFindMany.mockResolvedValue([playerTeamRow()]);
    tsFindMany.mockResolvedValue([teamStaffRow()]);

    const result = await service.findAllByTeam(requester);

    expect(result.total).toBe(2);
    expect(result.data.map((row) => row.role)).toEqual(
      expect.arrayContaining(['PLAYER', 'PRINCIPAL']),
    );
    // Statut ACTIVE : ne filtre jamais sur leaveDate/endDate non-null.
    expect(ptFindMany).toHaveBeenCalledWith({
      where: { teamId: 5, leaveDate: null, mainPosition: undefined },
      include: { player: { include: { member: { include: { user: true } } } } },
    });
    expect(tsFindMany).toHaveBeenCalledWith({
      where: { teamId: 5, endDate: null },
      include: { member: { include: { user: true } } },
    });
  });

  it('normalise chaque ligne (memberId, email dérivé du User lié, isArchived)', async () => {
    ptFindMany.mockResolvedValue([playerTeamRow()]);

    const result = await service.findAllByTeam(requester);

    expect(result.data[0]).toMatchObject({
      id: 200,
      memberId: 42,
      role: 'PLAYER',
      firstName: 'Karim',
      lastName: 'Benali',
      email: 'karim@example.com',
      jerseyNumber: 9,
      isArchived: false,
    });
  });

  it("dérive isArchived=true et email=null quand le membre n'a pas de compte User", async () => {
    ptFindMany.mockResolvedValue([
      playerTeamRow({
        leaveDate: new Date('2026-01-01'),
        player: {
          id: 100,
          memberId: 42,
          member: {
            id: 42,
            firstName: 'Karim',
            lastName: 'Benali',
            phone: null,
            birthDate: null,
            user: null,
          },
        },
      }),
    ]);

    const result = await service.findAllByTeam(requester, { status: 'ALL' });

    expect(result.data[0]).toMatchObject({ isArchived: true, email: null });
  });

  describe('filtre statut Actif/Archivé/Tout', () => {
    it('refuse status=ARCHIVED sans la permission roster_archive', async () => {
      can.mockResolvedValue(null);

      await expect(
        service.findAllByTeam(requester, { status: 'ARCHIVED' }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(ptFindMany).not.toHaveBeenCalled();
    });

    it('refuse status=ALL sans la permission roster_archive', async () => {
      can.mockResolvedValue(null);

      await expect(
        service.findAllByTeam(requester, { status: 'ALL' }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('autorise status=ARCHIVED avec la permission roster_archive (filtre leaveDate/endDate non-null)', async () => {
      can.mockResolvedValue('TEAM');

      await service.findAllByTeam(requester, { status: 'ARCHIVED' });

      expect(ptFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, leaveDate: { not: null }, mainPosition: undefined },
        include: {
          player: { include: { member: { include: { user: true } } } },
        },
      });
      expect(tsFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, endDate: { not: null } },
        include: { member: { include: { user: true } } },
      });
    });

    it('ne filtre pas sur leaveDate/endDate pour status=ALL', async () => {
      await service.findAllByTeam(requester, { status: 'ALL' });

      expect(ptFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, leaveDate: undefined, mainPosition: undefined },
        include: {
          player: { include: { member: { include: { user: true } } } },
        },
      });
    });
  });

  describe('staff dégradé silencieusement sans team_staff READ', () => {
    it("omet le staff (pas de 403) si l'appelant n'a pas team_staff READ", async () => {
      ptFindMany.mockResolvedValue([playerTeamRow()]);
      tsFindMany.mockResolvedValue([teamStaffRow()]);
      can.mockImplementation(
        (_memberId: number, _action: string, resource: string) =>
          Promise.resolve(resource === 'team_staff' ? null : 'TEAM'),
      );

      const result = await service.findAllByTeam(requester);

      expect(result.total).toBe(1);
      expect(result.data[0].role).toBe('PLAYER');
      expect(tsFindMany).not.toHaveBeenCalled();
    });
  });

  describe('filtre par poste', () => {
    it('transmet le filtre de poste à la requête PlayerTeam', async () => {
      await service.findAllByTeam(requester, { position: ['CB', 'RB'] });

      expect(ptFindMany).toHaveBeenCalledWith({
        where: {
          teamId: 5,
          leaveDate: null,
          mainPosition: { in: ['CB', 'RB'] },
        },
        include: {
          player: { include: { member: { include: { user: true } } } },
        },
      });
    });

    it('exclut le staff quand un filtre de poste est appliqué (aucun staff ne peut y correspondre)', async () => {
      ptFindMany.mockResolvedValue([playerTeamRow()]);
      tsFindMany.mockResolvedValue([teamStaffRow()]);

      const result = await service.findAllByTeam(requester, {
        position: ['ST'],
      });

      expect(result.total).toBe(1);
      expect(tsFindMany).not.toHaveBeenCalled();
    });
  });

  describe('tri', () => {
    it('trie par nom de famille croissant par défaut', async () => {
      ptFindMany.mockResolvedValue([
        playerTeamRow({
          id: 201,
          player: {
            id: 101,
            memberId: 43,
            member: {
              id: 43,
              firstName: 'Zoe',
              lastName: 'Zidane',
              phone: null,
              birthDate: null,
              user: null,
            },
          },
        }),
        playerTeamRow({
          id: 200,
          player: {
            id: 100,
            memberId: 42,
            member: {
              id: 42,
              firstName: 'Karim',
              lastName: 'Adjovi',
              phone: null,
              birthDate: null,
              user: null,
            },
          },
        }),
      ]);

      const result = await service.findAllByTeam(requester);

      expect(result.data.map((row) => row.lastName)).toEqual([
        'Adjovi',
        'Zidane',
      ]);
    });

    it('trie par jerseyNumber en plaçant les valeurs nulles en fin de liste, quel que soit le sens', async () => {
      ptFindMany.mockResolvedValue([
        playerTeamRow({ id: 201, jerseyNumber: null }),
        playerTeamRow({ id: 200, jerseyNumber: 9 }),
        playerTeamRow({ id: 202, jerseyNumber: 3 }),
      ]);

      const asc = await service.findAllByTeam(requester, {
        sortBy: 'jerseyNumber',
        sortOrder: 'asc',
      });
      expect(asc.data.map((row) => row.jerseyNumber)).toEqual([3, 9, null]);

      const desc = await service.findAllByTeam(requester, {
        sortBy: 'jerseyNumber',
        sortOrder: 'desc',
      });
      expect(desc.data.map((row) => row.jerseyNumber)).toEqual([9, 3, null]);
    });

    it('trie par rôle avec le staff avant les joueurs (Principal en tête)', async () => {
      ptFindMany.mockResolvedValue([playerTeamRow()]);
      tsFindMany.mockResolvedValue([
        teamStaffRow({
          id: 301,
          staffRole: 'ADJOINT',
          memberId: 8,
          member: {
            id: 8,
            firstName: 'Bob',
            lastName: 'Bricolo',
            phone: null,
            birthDate: null,
            user: null,
          },
        }),
        teamStaffRow({ id: 300, staffRole: 'PRINCIPAL' }),
      ]);

      const result = await service.findAllByTeam(requester, { sortBy: 'role' });

      expect(result.data.map((row) => row.role)).toEqual([
        'PRINCIPAL',
        'ADJOINT',
        'PLAYER',
      ]);
    });
  });

  describe('pagination', () => {
    it('pagine sur le tableau fusionné et renvoie le total non tronqué', async () => {
      ptFindMany.mockResolvedValue([
        playerTeamRow({ id: 200 }),
        playerTeamRow({ id: 201 }),
        playerTeamRow({ id: 202 }),
      ]);

      const result = await service.findAllByTeam(requester, {
        page: 2,
        pageSize: 20,
      });
      // pageSize 20 avec 3 lignes : une seule page, page 2 est donc vide.
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(0);
    });

    it('découpe correctement avec une petite pageSize', async () => {
      ptFindMany.mockResolvedValue([
        playerTeamRow({ id: 200 }),
        playerTeamRow({ id: 201 }),
        playerTeamRow({ id: 202 }),
      ]);

      const result = await service.findAllByTeam(requester, {
        pageSize: 20,
        page: 1,
      });
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
    });
  });
});
