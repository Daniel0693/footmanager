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

  describe('indicateurs de capacité (canViewArchived/canCreate/canEdit/canDelete)', () => {
    // Le frontend n'a aucune infra de permission côté client : ces
    // indicateurs, calculés ici via PermissionsService (déjà la source de
    // vérité backend), lui indiquent quels contrôles afficher (filtre
    // Archivé, boutons Créer/Éditer/Supprimer en masse) sans exposer de
    // nouvel endpoint "mes permissions" — voir docs/modules/effectif-joueurs.md.
    it('renvoie true pour les quatre indicateurs quand tout est accordé', async () => {
      can.mockResolvedValue('TEAM');

      const result = await service.findAllByTeam(requester);

      expect(result).toMatchObject({
        canViewArchived: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      });
    });

    it('renvoie false par ressource quand la permission correspondante est refusée (ex. Player)', async () => {
      can.mockImplementation(
        (_memberId: number, action: string, resource: string) => {
          if (resource === 'player_team' && action === 'READ') {
            return Promise.resolve('TEAM'); // déjà requis par le guard
          }
          return Promise.resolve(null); // ni roster_archive, ni player_team CREATE/UPDATE, ni member DELETE
        },
      );

      const result = await service.findAllByTeam(requester);

      expect(result).toMatchObject({
        canViewArchived: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      });
    });

    it('canDelete reflète member DELETE indépendamment de canEdit/canCreate (ex. Coach : édite mais ne supprime jamais)', async () => {
      can.mockImplementation(
        (_memberId: number, action: string, resource: string) =>
          Promise.resolve(
            resource === 'member' && action === 'DELETE' ? null : 'TEAM',
          ),
      );

      const result = await service.findAllByTeam(requester);

      expect(result).toMatchObject({
        canEdit: true,
        canCreate: true,
        canDelete: false,
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

function buildBulkPrismaStub(overrides: Record<string, unknown> = {}) {
  const tx = {
    member: {
      create: jest.fn().mockResolvedValue({
        id: 900,
        firstName: 'Nouveau',
        lastName: 'Joueur',
        phone: null,
        birthDate: null,
      }),
      update: jest.fn().mockResolvedValue({
        id: 42,
        firstName: 'Karim',
        lastName: 'Benali',
        phone: null,
        birthDate: null,
        user: null,
      }),
    },
    playerProfile: {
      create: jest.fn().mockResolvedValue({ id: 950, memberId: 900 }),
    },
    playerTeam: {
      create: jest.fn().mockResolvedValue({
        id: 990,
        playerId: 950,
        teamId: 5,
        jerseyNumber: 10,
        mainPosition: null,
        secondaryPositions: [],
        leaveDate: null,
      }),
      update: jest.fn().mockResolvedValue({
        id: 200,
        playerId: 100,
        teamId: 5,
        jerseyNumber: 11,
        mainPosition: 'ST',
        secondaryPositions: [],
        leaveDate: null,
      }),
      // Deux usages bien distincts partagent ce même mock : résoudre
      // l'affectation ciblée par bulkUpdate (`where.id` est un nombre
      // simple) vs. vérifier la disponibilité d'un numéro de maillot
      // (`where` n'a jamais de `id` simple — soit absent en création, soit
      // `{ not: excludeId }` en modification). On distingue les deux sur la
      // forme de `where.id` plutôt que sur l'ordre d'appel, plus robuste
      // aux tests qui n'exercent qu'un seul des deux chemins.
      findFirst: jest.fn((args: { where: { id?: unknown } }) =>
        typeof args.where.id === 'number'
          ? Promise.resolve({
              id: args.where.id,
              playerId: 100,
              teamId: 5,
              jerseyNumber: 9,
              player: { id: 100, memberId: 42 },
            })
          : Promise.resolve(null),
      ),
    },
  };
  const transaction = jest.fn((callback: (tx: unknown) => unknown) =>
    callback(tx),
  );
  const prismaStub = {
    team: { findFirst: jest.fn().mockResolvedValue(team) },
    $transaction: transaction,
    ...overrides,
  } as unknown as PrismaService;
  return { prismaStub, tx, transaction };
}

describe('RosterService.bulkCreate', () => {
  const permissionsStub = { can: jest.fn() } as unknown as PermissionsService;

  it('crée Member + PlayerProfile + PlayerTeam pour chaque ligne, en une transaction', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    const service = new RosterService(prismaStub, permissionsStub);

    const result = await service.bulkCreate(1, 5, [
      { firstName: 'Nouveau', lastName: 'Joueur', jerseyNumber: 10 },
    ]);

    expect(tx.member.create).toHaveBeenCalledWith({
      data: {
        clubId: 1,
        firstName: 'Nouveau',
        lastName: 'Joueur',
        phone: undefined,
        gender: undefined,
        birthDate: undefined,
      },
    });
    expect(tx.playerProfile.create).toHaveBeenCalledWith({
      data: { memberId: 900 },
    });
    expect(tx.playerTeam.create).toHaveBeenCalledWith({
      data: {
        playerId: 950,
        teamId: 5,
        jerseyNumber: 10,
        mainPosition: undefined,
        secondaryPositions: [],
        joinDate: undefined,
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 990,
        memberId: 900,
        role: 'PLAYER',
        email: null,
      }),
    ]);
  });

  it("refuse (409) si le numéro de maillot d'une ligne est déjà pris par une affectation active", async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    (tx.playerTeam as { findFirst: jest.Mock }).findFirst = jest
      .fn()
      .mockResolvedValue({ id: 1, jerseyNumber: 10 }); // conflit déjà en base
    const service = new RosterService(prismaStub, permissionsStub);

    await expect(
      service.bulkCreate(1, 5, [
        { firstName: 'A', lastName: 'B', jerseyNumber: 10 },
      ]),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(tx.member.create).not.toHaveBeenCalled();
  });

  it('refuse (409) si deux lignes du même envoi utilisent le même numéro de maillot (détecté via la visibilité intra-transaction)', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    let createCount = 0;
    (tx.playerTeam as { findFirst: jest.Mock }).findFirst = jest.fn(() => {
      // La première ligne n'a encore rien créé (pas de conflit) ; la
      // seconde ligne, elle, doit voir la première déjà insérée dans la
      // même transaction.
      return Promise.resolve(
        createCount > 0 ? { id: 1, jerseyNumber: 10 } : null,
      );
    });
    (tx.playerTeam as { create: jest.Mock }).create = jest.fn(() => {
      createCount += 1;
      return Promise.resolve({
        id: 990 + createCount,
        playerId: 950,
        teamId: 5,
        jerseyNumber: 10,
        mainPosition: null,
        secondaryPositions: [],
        leaveDate: null,
      });
    });
    const service = new RosterService(prismaStub, permissionsStub);

    await expect(
      service.bulkCreate(1, 5, [
        { firstName: 'A', lastName: 'A', jerseyNumber: 10 },
        { firstName: 'B', lastName: 'B', jerseyNumber: 10 },
      ]),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    // La vérification de disponibilité précède la création du Member pour
    // chaque ligne : la 2e ligne échoue avant même de créer son Member.
    expect(tx.member.create).toHaveBeenCalledTimes(1);
  });

  it("renvoie 404 si l'équipe n'appartient pas au club (avant toute transaction)", async () => {
    const { prismaStub, transaction } = buildBulkPrismaStub({
      team: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new RosterService(prismaStub, permissionsStub);

    await expect(
      service.bulkCreate(1, 5, [{ firstName: 'A', lastName: 'B' }]),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('RosterService.bulkUpdate', () => {
  const permissionsStub = { can: jest.fn() } as unknown as PermissionsService;

  it('met à jour Member et PlayerTeam pour chaque ligne, en une transaction', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    const service = new RosterService(prismaStub, permissionsStub);

    const result = await service.bulkUpdate(1, 5, [
      { id: 200, lastName: 'Benali-Modifié', jerseyNumber: 11 },
    ]);

    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        firstName: undefined,
        lastName: 'Benali-Modifié',
        phone: undefined,
        gender: undefined,
        birthDate: undefined,
      },
      include: { user: true },
    });
    expect(tx.playerTeam.update).toHaveBeenCalledWith({
      where: { id: 200 },
      data: {
        jerseyNumber: 11,
        mainPosition: undefined,
        secondaryPositions: undefined,
        joinDate: undefined,
        leaveDate: undefined,
      },
    });
    expect(result).toEqual([
      expect.objectContaining({ id: 200, memberId: 42, role: 'PLAYER' }),
    ]);
  });

  it('renvoie 404 si une ligne cible un PlayerTeam introuvable dans cette équipe/club', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    (tx.playerTeam as { findFirst: jest.Mock }).findFirst = jest
      .fn()
      .mockResolvedValue(null);
    const service = new RosterService(prismaStub, permissionsStub);

    await expect(service.bulkUpdate(1, 5, [{ id: 999 }])).rejects.toMatchObject(
      { status: HttpStatus.NOT_FOUND },
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('refuse (409) si le nouveau numéro de maillot est déjà pris par une AUTRE affectation active', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    (tx.playerTeam as { findFirst: jest.Mock }).findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 200,
        playerId: 100,
        teamId: 5,
        jerseyNumber: 9,
        player: { id: 100, memberId: 42 },
      })
      .mockResolvedValueOnce({ id: 201, jerseyNumber: 11 }); // conflit

    const service = new RosterService(prismaStub, permissionsStub);

    await expect(
      service.bulkUpdate(1, 5, [{ id: 200, jerseyNumber: 11 }]),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('ne revérifie pas le numéro de maillot si inchangé', async () => {
    const { prismaStub, tx } = buildBulkPrismaStub();
    const findFirst = tx.playerTeam.findFirst as jest.Mock;

    const service = new RosterService(prismaStub, permissionsStub);

    await service.bulkUpdate(1, 5, [{ id: 200, jerseyNumber: 9 }]);

    // Un seul appel findFirst (résolution de l'affectation) : pas de second
    // appel pour vérifier la disponibilité du numéro puisqu'il n'a pas changé.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
