import { HttpStatus } from '@nestjs/common';
import type { Season } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from './seasons.service';

const draftSeason: Season = {
  id: 100,
  clubId: 1,
  name: 'Saison 2026-2027',
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
  startDate: new Date('2025-08-01'),
  endDate: new Date('2026-06-30'),
  status: 'ACTIVE',
};

describe('SeasonsService', () => {
  let seasonFindFirst: jest.Mock;
  let seasonFindMany: jest.Mock;
  let seasonCreate: jest.Mock;
  let seasonUpdate: jest.Mock;
  let seasonDelete: jest.Mock;
  let seasonCount: jest.Mock;
  let seasonFindUniqueOrThrow: jest.Mock;
  let transaction: jest.Mock;
  let txSeasonUpdate: jest.Mock;
  let service: SeasonsService;

  beforeEach(() => {
    seasonFindFirst = jest.fn();
    seasonFindMany = jest.fn();
    seasonCreate = jest.fn();
    seasonUpdate = jest.fn();
    seasonDelete = jest.fn();
    seasonCount = jest.fn().mockResolvedValue(1);
    seasonFindUniqueOrThrow = jest.fn();
    txSeasonUpdate = jest.fn();
    transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ season: { update: txSeasonUpdate } }),
    );

    const prismaStub = {
      season: {
        findFirst: seasonFindFirst,
        findMany: seasonFindMany,
        create: seasonCreate,
        update: seasonUpdate,
        delete: seasonDelete,
        count: seasonCount,
        findUniqueOrThrow: seasonFindUniqueOrThrow,
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    service = new SeasonsService(prismaStub);
  });

  describe('create', () => {
    it('crée toujours la saison en DRAFT', async () => {
      seasonFindFirst.mockResolvedValue(null); // pas de chevauchement
      seasonCreate.mockResolvedValue(draftSeason);

      const result = await service.create(1, {
        name: 'Saison 2026-2027',
        startDate: draftSeason.startDate,
        endDate: draftSeason.endDate,
      });

      expect(result).toBe(draftSeason);
      expect(seasonCreate).toHaveBeenCalledWith({
        data: {
          clubId: 1,
          name: 'Saison 2026-2027',
          startDate: draftSeason.startDate,
          endDate: draftSeason.endDate,
          status: 'DRAFT',
        },
      });
    });

    it('refuse une plage de dates qui chevauche une saison existante du club', async () => {
      seasonFindFirst.mockResolvedValue(activeSeason); // chevauchement détecté

      await expect(
        service.create(1, {
          name: 'Saison concurrente',
          startDate: draftSeason.startDate,
          endDate: draftSeason.endDate,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(seasonCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByClub', () => {
    it('liste les saisons du club, triées par date de début décroissante', async () => {
      seasonFindMany.mockResolvedValue([activeSeason, draftSeason]);

      const result = await service.findAllByClub(1);

      expect(result).toEqual([activeSeason, draftSeason]);
      expect(seasonFindMany).toHaveBeenCalledWith({
        where: { clubId: 1, status: undefined },
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
      // Prisma les renvoie triées par startDate desc uniquement (pas par
      // statut) : DRAFT (le plus récent) avant ACTIVE avant ARCHIVED.
      seasonFindMany.mockResolvedValue([
        draftSeason,
        activeSeason,
        archivedSeason,
      ]);

      const result = await service.findAllByClub(1);

      expect(result).toEqual([activeSeason, draftSeason, archivedSeason]);
    });

    it('filtre par statut quand demandé', async () => {
      seasonFindMany.mockResolvedValue([activeSeason]);

      await service.findAllByClub(1, { status: 'ACTIVE' });

      expect(seasonFindMany).toHaveBeenCalledWith({
        where: { clubId: 1, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('renvoie 404 si la saison est introuvable dans ce club', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('retourne la saison trouvée', async () => {
      seasonFindFirst.mockResolvedValue(draftSeason);

      await expect(service.findOne(1, 100)).resolves.toBe(draftSeason);
      expect(seasonFindFirst).toHaveBeenCalledWith({
        where: { id: 100, clubId: 1 },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si la saison est introuvable', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 100, { name: 'Nouveau nom' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(seasonUpdate).not.toHaveBeenCalled();
    });

    it('modifie une saison DRAFT sans revalider le chevauchement si les dates ne changent pas', async () => {
      seasonFindFirst.mockResolvedValueOnce(draftSeason); // findSeasonOrThrow
      seasonUpdate.mockResolvedValue({ ...draftSeason, name: 'Nouveau nom' });

      const result = await service.update(1, 100, { name: 'Nouveau nom' });

      expect(result.name).toBe('Nouveau nom');
      expect(seasonFindFirst).toHaveBeenCalledTimes(1); // pas de second appel pour le chevauchement
      expect(seasonUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          name: 'Nouveau nom',
          startDate: undefined,
          endDate: undefined,
        },
      });
    });

    it('revalide le chevauchement quand les dates changent, en excluant la saison elle-même', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason) // findSeasonOrThrow
        .mockResolvedValueOnce(null); // assertNoOverlap : aucun chevauchement
      seasonUpdate.mockResolvedValue({
        ...draftSeason,
        endDate: new Date('2027-07-15'),
      });

      await service.update(1, 100, { endDate: new Date('2027-07-15') });

      expect(seasonFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          clubId: 1,
          id: { not: 100 },
          startDate: { lte: new Date('2027-07-15') },
          endDate: { gte: draftSeason.startDate },
        },
      });
    });

    it('refuse un changement de dates qui chevauche une autre saison du club', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason)
        .mockResolvedValueOnce(activeSeason); // chevauchement détecté

      await expect(
        service.update(1, 100, { endDate: new Date('2027-07-15') }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(seasonUpdate).not.toHaveBeenCalled();
    });

    it('autorise la modification d’une saison ARCHIVED (pas de verrou)', async () => {
      const archivedSeason: Season = { ...activeSeason, status: 'ARCHIVED' };
      seasonFindFirst
        .mockResolvedValueOnce(archivedSeason)
        .mockResolvedValueOnce(null);
      seasonUpdate.mockResolvedValue({
        ...archivedSeason,
        endDate: new Date('2026-06-15'),
      });

      await service.update(1, archivedSeason.id, {
        endDate: new Date('2026-06-15'),
      });

      expect(seasonUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('renvoie 404 si la saison est introuvable', async () => {
      seasonFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(seasonDelete).not.toHaveBeenCalled();
    });

    it('supprime une saison DRAFT', async () => {
      seasonFindFirst.mockResolvedValue(draftSeason);

      await service.remove(1, 100);

      expect(seasonDelete).toHaveBeenCalledWith({ where: { id: 100 } });
    });

    it('refuse de supprimer une saison ACTIVE ou ARCHIVED', async () => {
      seasonFindFirst.mockResolvedValue(activeSeason);

      await expect(service.remove(1, activeSeason.id)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(seasonDelete).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('refuse si la saison ciblée n’est pas DRAFT', async () => {
      seasonFindFirst.mockResolvedValueOnce(activeSeason);

      await expect(service.activate(1, activeSeason.id)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('archive l’ancienne saison ACTIVE du club et active la nouvelle, sans toucher PlayerTeam', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason) // findSeasonOrThrow(newSeason)
        .mockResolvedValueOnce(activeSeason); // recherche de l'ancienne ACTIVE
      seasonFindUniqueOrThrow.mockResolvedValue({
        ...draftSeason,
        status: 'ACTIVE',
      });

      const result = await service.activate(1, draftSeason.id);

      expect(txSeasonUpdate).toHaveBeenCalledWith({
        where: { id: activeSeason.id },
        data: { status: 'ARCHIVED', endDate: activeSeason.endDate },
      });
      expect(txSeasonUpdate).toHaveBeenCalledWith({
        where: { id: draftSeason.id },
        data: { status: 'ACTIVE' },
      });
      expect(result.status).toBe('ACTIVE');
    });

    it('applique la correction de endDate transmise pour l’ancienne saison, après vérification du chevauchement', async () => {
      const override = new Date('2026-08-31');
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason)
        .mockResolvedValueOnce(activeSeason)
        .mockResolvedValueOnce(null); // assertNoOverlap sur l'override : aucun chevauchement
      seasonFindUniqueOrThrow.mockResolvedValue(draftSeason);

      await service.activate(1, draftSeason.id, override);

      expect(seasonFindFirst).toHaveBeenNthCalledWith(3, {
        where: {
          clubId: 1,
          id: { not: activeSeason.id },
          startDate: { lte: override },
          endDate: { gte: activeSeason.startDate },
        },
      });
      expect(txSeasonUpdate).toHaveBeenCalledWith({
        where: { id: activeSeason.id },
        data: { status: 'ARCHIVED', endDate: override },
      });
    });

    it('refuse une correction de endDate qui chevaucherait une autre saison', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason)
        .mockResolvedValueOnce(activeSeason)
        .mockResolvedValueOnce(draftSeason); // chevauchement détecté

      await expect(
        service.activate(1, draftSeason.id, new Date('2026-08-31')),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('première saison du club (aucune ancienne ACTIVE) : active directement, sans archivage', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason)
        .mockResolvedValueOnce(null); // pas d'ancienne saison ACTIVE
      seasonFindUniqueOrThrow.mockResolvedValue({
        ...draftSeason,
        status: 'ACTIVE',
      });

      await service.activate(1, draftSeason.id);

      expect(txSeasonUpdate).toHaveBeenCalledTimes(1);
      expect(txSeasonUpdate).toHaveBeenCalledWith({
        where: { id: draftSeason.id },
        data: { status: 'ACTIVE' },
      });
    });

    it('assertion défensive : rejette si plus d’une saison ACTIVE subsiste après la transaction', async () => {
      seasonFindFirst
        .mockResolvedValueOnce(draftSeason)
        .mockResolvedValueOnce(null);
      seasonCount.mockResolvedValue(2);

      await expect(service.activate(1, draftSeason.id)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });
  });
});
