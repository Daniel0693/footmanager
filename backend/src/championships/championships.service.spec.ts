import { HttpStatus } from '@nestjs/common';
import type { Championship, Season, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ChampionshipsService } from './championships.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15',
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
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new ChampionshipsService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('crée un championnat avec les défauts de points/format de jeu', async () => {
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
    it('liste les championnats de l’équipe, filtrable par saison', async () => {
      championshipFindMany.mockResolvedValue([championship]);

      const result = await service.findAllByTeam(1, 5, 42, { seasonId: 10 });

      expect(result).toEqual({ data: [championship], canManage: true });
      expect(championshipFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, seasonId: 10 },
        orderBy: { startDate: 'desc' },
      });
    });

    it('canManage reflète CREATE sur `championship`, scopé teamId (Player en lecture seule)', async () => {
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
      expect(result.canManage).toBe(false);
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
