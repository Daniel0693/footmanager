import { HttpStatus } from '@nestjs/common';
import type { Season, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from './seasons.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const draftSeason: Season = {
  id: 100,
  teamId: 5,
  name: 'Saison 2026-2027',
  teamNameSnapshot: null,
  categorySnapshot: null,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2027-06-30'),
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeSeason: Season = {
  ...draftSeason,
  id: 99,
  name: 'Saison 2025-2026',
  status: 'ACTIVE',
};

describe('SeasonsService', () => {
  let teamFindFirst: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let seasonFindMany: jest.Mock;
  let seasonCreate: jest.Mock;
  let seasonUpdate: jest.Mock;
  let seasonDelete: jest.Mock;
  let service: SeasonsService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    seasonFindFirst = jest.fn();
    seasonFindMany = jest.fn();
    seasonCreate = jest.fn();
    seasonUpdate = jest.fn();
    seasonDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      season: {
        findFirst: seasonFindFirst,
        findMany: seasonFindMany,
        create: seasonCreate,
        update: seasonUpdate,
        delete: seasonDelete,
      },
    } as unknown as PrismaService;

    service = new SeasonsService(prismaStub);
  });

  describe('create', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, {
          name: 'Saison 2026-2027',
          startDate: draftSeason.startDate,
          endDate: draftSeason.endDate,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(seasonCreate).not.toHaveBeenCalled();
    });

    it('crée toujours la saison en DRAFT', async () => {
      teamFindFirst.mockResolvedValue(team);
      seasonCreate.mockResolvedValue(draftSeason);

      const result = await service.create(1, 5, {
        name: 'Saison 2026-2027',
        startDate: draftSeason.startDate,
        endDate: draftSeason.endDate,
      });

      expect(result).toBe(draftSeason);
      expect(seasonCreate).toHaveBeenCalledWith({
        data: {
          teamId: 5,
          name: 'Saison 2026-2027',
          teamNameSnapshot: undefined,
          categorySnapshot: undefined,
          startDate: draftSeason.startDate,
          endDate: draftSeason.endDate,
          status: 'DRAFT',
        },
      });
    });
  });

  describe('findAllByTeam', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(service.findAllByTeam(1, 5)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(seasonFindMany).not.toHaveBeenCalled();
    });

    it('liste les saisons triées par date de début décroissante', async () => {
      teamFindFirst.mockResolvedValue(team);
      seasonFindMany.mockResolvedValue([activeSeason, draftSeason]);

      const result = await service.findAllByTeam(1, 5);

      expect(result).toEqual([activeSeason, draftSeason]);
      expect(seasonFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, status: undefined },
        orderBy: { startDate: 'desc' },
      });
    });

    it('réordonne par priorité de statut (ACTIVE > DRAFT > ARCHIVED) même si Prisma les renvoie autrement', async () => {
      const archivedSeason: Season = {
        ...draftSeason,
        id: 98,
        name: 'Saison 2024-2025',
        status: 'ARCHIVED',
      };
      teamFindFirst.mockResolvedValue(team);
      // Prisma les renvoie triées par startDate desc uniquement (pas par
      // statut) : DRAFT (le plus récent) avant ACTIVE avant ARCHIVED.
      seasonFindMany.mockResolvedValue([
        draftSeason,
        activeSeason,
        archivedSeason,
      ]);

      const result = await service.findAllByTeam(1, 5);

      expect(result).toEqual([activeSeason, draftSeason, archivedSeason]);
    });

    it('filtre par statut quand demandé', async () => {
      teamFindFirst.mockResolvedValue(team);
      seasonFindMany.mockResolvedValue([activeSeason]);

      await service.findAllByTeam(1, 5, { status: 'ACTIVE' });

      expect(seasonFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('renvoie 404 si la saison est introuvable dans cette équipe/club', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 5, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('retourne la saison trouvée', async () => {
      seasonFindFirst.mockResolvedValue(draftSeason);

      await expect(service.findOne(1, 5, 100)).resolves.toBe(draftSeason);
      expect(seasonFindFirst).toHaveBeenCalledWith({
        where: { id: 100, teamId: 5, team: { clubId: 1 } },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si la saison est introuvable', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 100, { name: 'Nouveau nom' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(seasonUpdate).not.toHaveBeenCalled();
    });

    it('modifie une saison DRAFT', async () => {
      seasonFindFirst.mockResolvedValue(draftSeason);
      seasonUpdate.mockResolvedValue({ ...draftSeason, name: 'Nouveau nom' });

      const result = await service.update(1, 5, 100, { name: 'Nouveau nom' });

      expect(result.name).toBe('Nouveau nom');
      expect(seasonUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          name: 'Nouveau nom',
          teamNameSnapshot: undefined,
          categorySnapshot: undefined,
          startDate: undefined,
          endDate: undefined,
        },
      });
    });

    it('autorise la modification d’une saison ARCHIVED (pas de verrou)', async () => {
      const archivedSeason: Season = { ...activeSeason, status: 'ARCHIVED' };
      seasonFindFirst.mockResolvedValue(archivedSeason);
      seasonUpdate.mockResolvedValue({
        ...archivedSeason,
        endDate: new Date('2026-06-15'),
      });

      await service.update(1, 5, archivedSeason.id, {
        endDate: new Date('2026-06-15'),
      });

      expect(seasonUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('renvoie 404 si la saison est introuvable', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(seasonDelete).not.toHaveBeenCalled();
    });

    it('supprime une saison DRAFT', async () => {
      seasonFindFirst.mockResolvedValue(draftSeason);

      await service.remove(1, 5, 100);

      expect(seasonDelete).toHaveBeenCalledWith({ where: { id: 100 } });
    });

    it('refuse de supprimer une saison ACTIVE ou ARCHIVED', async () => {
      seasonFindFirst.mockResolvedValue(activeSeason);

      await expect(service.remove(1, 5, activeSeason.id)).rejects.toMatchObject(
        { status: HttpStatus.CONFLICT },
      );
      expect(seasonDelete).not.toHaveBeenCalled();
    });
  });
});
