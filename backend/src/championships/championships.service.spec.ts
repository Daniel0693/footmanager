import { HttpStatus } from '@nestjs/common';
import type { Championship, Season, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ChampionshipsService } from './championships.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15',
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const season: Season = {
  id: 10,
  clubId: 1,
  name: 'Saison 2026-2027',
  startDate: new Date('2026-08-01'),
  endDate: new Date('2027-06-30'),
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const championship: Championship = {
  id: 100,
  seasonId: 10,
  teamId: 5,
  name: 'Championnat Automne',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-12-15'),
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakerRules: ['GOAL_DIFFERENCE', 'GOALS_SCORED'],
  tiebreakerPreset: null,
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  gameFormat: 'ELEVEN',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ChampionshipsService', () => {
  let teamFindFirst: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let championshipFindFirst: jest.Mock;
  let championshipFindMany: jest.Mock;
  let championshipCreate: jest.Mock;
  let championshipUpdate: jest.Mock;
  let championshipDelete: jest.Mock;
  let participantFindMany: jest.Mock;
  let participantCreate: jest.Mock;
  let matchFindMany: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: ChampionshipsService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    seasonFindFirst = jest.fn().mockResolvedValue(season);
    championshipFindFirst = jest.fn();
    championshipFindMany = jest.fn();
    championshipCreate = jest.fn();
    championshipUpdate = jest.fn();
    championshipDelete = jest.fn();
    participantFindMany = jest.fn();
    participantCreate = jest.fn().mockResolvedValue({ id: 200 });
    matchFindMany = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      season: { findFirst: seasonFindFirst },
      championship: {
        findFirst: championshipFindFirst,
        findMany: championshipFindMany,
        create: championshipCreate,
        update: championshipUpdate,
        delete: championshipDelete,
      },
      championshipParticipant: {
        findMany: participantFindMany,
        create: participantCreate,
      },
      championshipMatch: { findMany: matchFindMany },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new ChampionshipsService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('crée un championnat avec les défauts de points/format de jeu, et ajoute automatiquement l’équipe propriétaire comme participant', async () => {
      championshipCreate.mockResolvedValue(championship);

      const result = await service.create(1, 5, {
        seasonId: 10,
        name: 'Championnat Automne',
        startDate: championship.startDate,
        endDate: championship.endDate,
        tiebreakerRules: ['GOAL_DIFFERENCE', 'GOALS_SCORED'],
      });

      expect(result).toBe(championship);
      expect(championshipCreate).toHaveBeenCalledWith({
        data: {
          seasonId: 10,
          teamId: 5,
          name: 'Championnat Automne',
          startDate: championship.startDate,
          endDate: championship.endDate,
          pointsForWin: 3,
          pointsForDraw: 1,
          pointsForLoss: 0,
          tiebreakerRules: ['GOAL_DIFFERENCE', 'GOALS_SCORED'],
          tiebreakerPreset: undefined,
          numberOfPeriods: 2,
          periodDurationMinutes: 45,
        },
      });
      expect(participantCreate).toHaveBeenCalledWith({
        data: { championshipId: championship.id, internalTeamId: 5 },
      });
    });

    it('refuse une équipe hors du club', async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, {
          seasonId: 10,
          name: 'Championnat Automne',
          startDate: championship.startDate,
          endDate: championship.endDate,
          tiebreakerRules: [],
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(championshipCreate).not.toHaveBeenCalled();
    });

    it('refuse une saison hors du club', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, {
          seasonId: 999,
          name: 'Championnat Automne',
          startDate: championship.startDate,
          endDate: championship.endDate,
          tiebreakerRules: [],
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(championshipCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByTeam', () => {
    it('liste les championnats de l’équipe, filtrable par saison, avec canManage/createScope/readScope', async () => {
      championshipFindMany.mockResolvedValue([championship]);

      const result = await service.findAllByTeam(1, 5, 42, { seasonId: 10 });

      expect(result).toEqual({
        data: [championship],
        canManage: true,
        createScope: 'TEAM',
        readScope: 'TEAM',
      });
      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, seasonId: 10 },
        include: { season: { select: { id: true, name: true } } },
        orderBy: { startDate: 'desc' },
      });
    });

    it('canManage/createScope reflètent CREATE sur `championship`, scopé teamId (Player en lecture seule)', async () => {
      championshipFindMany.mockResolvedValue([]);
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByTeam(1, 5, 42);

      expect(permissionsCan).toHaveBeenCalledWith(
        42,
        'CREATE',
        'championship',
        {
          clubId: 1,
          teamId: 5,
        },
      );
      expect(permissionsCan).toHaveBeenCalledWith(42, 'READ', 'championship', {
        clubId: 1,
        teamId: 5,
      });
      expect(result.canManage).toBe(false);
      expect(result.createScope).toBeNull();
      expect(result.readScope).toBeNull();
    });

    it('createScope reflète CLUB pour un AdminClub', async () => {
      championshipFindMany.mockResolvedValue([]);
      permissionsCan.mockResolvedValue('CLUB');

      const result = await service.findAllByTeam(1, 5, 99);

      expect(result.canManage).toBe(true);
      expect(result.createScope).toBe('CLUB');
    });
  });

  describe('findAllBySeason', () => {
    it('scope CLUB/ALL : liste les championnats de la saison, toutes équipes confondues', async () => {
      championshipFindMany.mockResolvedValue([championship]);

      const result = await service.findAllBySeason(1, 10, { scope: 'CLUB' });

      expect(result).toEqual([championship]);
      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { seasonId: 10, teamId: undefined },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { startDate: 'desc' },
      });
    });

    it("scope TEAM : borne la vue à l'équipe de l'appelant (pas de fuite cross-équipe via ?teamId=)", async () => {
      championshipFindMany.mockResolvedValue([championship]);

      await service.findAllBySeason(1, 10, { scope: 'TEAM', teamId: 5 });

      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { seasonId: 10, teamId: 5 },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { startDate: 'desc' },
      });
    });

    it('renvoie 404 si la saison est introuvable dans ce club', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllBySeason(1, 999, { scope: 'CLUB' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(championshipFindMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllByClub', () => {
    it('scope CLUB/ALL : liste les championnats du club, toutes équipes confondues', async () => {
      championshipFindMany.mockResolvedValue([championship]);

      const result = await service.findAllByClub(1, 99, { scope: 'CLUB' });

      expect(result).toEqual({
        data: [championship],
        canManage: true,
        createScope: 'TEAM',
      });
      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { team: { clubId: 1 }, teamId: undefined },
        include: {
          season: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'desc' },
      });
    });

    it("scope TEAM : borne la vue à l'équipe de l'appelant (pas de fuite cross-équipe via ?teamId=)", async () => {
      championshipFindMany.mockResolvedValue([championship]);

      await service.findAllByClub(1, 42, { scope: 'TEAM', teamId: 5 });

      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { team: { clubId: 1 }, teamId: 5 },
        include: {
          season: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('renvoie 404 si le championnat est introuvable dans cette équipe', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 5, 100, 42)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('retourne le championnat trouvé avec le flag canManage', async () => {
      championshipFindFirst.mockResolvedValue(championship);

      await expect(service.findOne(1, 5, 100, 42)).resolves.toEqual({
        ...championship,
        canManage: true,
      });
      expect(championshipFindFirst).toHaveBeenCalledWith({
        where: { id: 100, teamId: 5 },
        include: { season: { select: { id: true, name: true } } },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si le championnat est introuvable', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 100, { name: 'Nouveau nom' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(championshipUpdate).not.toHaveBeenCalled();
    });

    it('modifie un championnat existant', async () => {
      championshipFindFirst.mockResolvedValue(championship);
      championshipUpdate.mockResolvedValue({
        ...championship,
        name: 'Nouveau nom',
      });

      const result = await service.update(1, 5, 100, { name: 'Nouveau nom' });

      expect(result.name).toBe('Nouveau nom');
      expect(championshipUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          seasonId: undefined,
          name: 'Nouveau nom',
          startDate: undefined,
          endDate: undefined,
          pointsForWin: undefined,
          pointsForDraw: undefined,
          pointsForLoss: undefined,
          tiebreakerRules: undefined,
          tiebreakerPreset: undefined,
          numberOfPeriods: undefined,
          periodDurationMinutes: undefined,
        },
      });
    });

    it('revalide la nouvelle saison si seasonId change', async () => {
      championshipFindFirst.mockResolvedValue(championship);
      seasonFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 100, { seasonId: 999 }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(championshipUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getStandings', () => {
    it('calcule le classement à partir des participants et rencontres FINISHED', async () => {
      championshipFindFirst.mockResolvedValue(championship);
      participantFindMany.mockResolvedValue([
        { id: 1, internalTeam: { id: 5, name: 'U15' }, externalTeam: null },
        {
          id: 2,
          internalTeam: null,
          externalTeam: { id: 50, name: 'FC Rivaux' },
        },
      ]);
      matchFindMany.mockResolvedValue([
        {
          homeParticipantId: 1,
          awayParticipantId: 2,
          scoreHome: 2,
          scoreAway: 0,
        },
      ]);

      const result = await service.getStandings(1, 5, 100);

      expect(matchFindMany).toHaveBeenCalledWith({
        where: { championshipId: 100, status: 'FINISHED' },
        select: {
          homeParticipantId: true,
          awayParticipantId: true,
          scoreHome: true,
          scoreAway: true,
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        participantId: 1,
        points: 3,
        rank: 1,
        participant: { id: 1, internalTeam: { id: 5, name: 'U15' } },
      });
      expect(result[1]).toMatchObject({ participantId: 2, points: 0, rank: 2 });
    });

    it('renvoie 404 si le championnat est introuvable', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(service.getStandings(1, 5, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(participantFindMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('renvoie 404 si le championnat est introuvable', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(championshipDelete).not.toHaveBeenCalled();
    });

    it('supprime un championnat existant', async () => {
      championshipFindFirst.mockResolvedValue(championship);

      await service.remove(1, 5, 100);

      expect(championshipDelete).toHaveBeenCalledWith({ where: { id: 100 } });
    });
  });
});
