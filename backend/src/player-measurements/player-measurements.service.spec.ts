import { HttpStatus } from '@nestjs/common';
import type { PlayerMeasurement, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerMeasurementsService } from './player-measurements.service';

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const measurement: PlayerMeasurement = {
  id: 1,
  playerId: 100,
  type: 'HEIGHT',
  value: '178.5' as unknown as PlayerMeasurement['value'],
  date: new Date('2026-01-15'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayerMeasurementsService', () => {
  let playerFindFirst: jest.Mock;
  let measurementCreate: jest.Mock;
  let measurementFindMany: jest.Mock;
  let measurementFindFirst: jest.Mock;
  let measurementDelete: jest.Mock;
  let service: PlayerMeasurementsService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    measurementCreate = jest.fn();
    measurementFindMany = jest.fn();
    measurementFindFirst = jest.fn();
    measurementDelete = jest.fn();

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerMeasurement: {
        create: measurementCreate,
        findMany: measurementFindMany,
        findFirst: measurementFindFirst,
        delete: measurementDelete,
      },
    } as unknown as PrismaService;

    service = new PlayerMeasurementsService(prismaStub);
  });

  describe('create', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 100, {
          type: 'HEIGHT',
          value: 178.5,
          date: new Date(),
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(measurementCreate).not.toHaveBeenCalled();
    });

    it('crée la mesure quand le joueur appartient au club', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementCreate.mockResolvedValue(measurement);
      const date = new Date('2026-01-15');

      const result = await service.create(1, 100, {
        type: 'HEIGHT',
        value: 178.5,
        date,
      });

      expect(result).toBe(measurement);
      expect(measurementCreate).toHaveBeenCalledWith({
        data: { playerId: 100, type: 'HEIGHT', value: 178.5, date },
      });
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 42, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('scope CLUB : autorise la lecture même si ce n’est pas son propre profil', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindMany.mockResolvedValue([measurement]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 999,
        scope: 'CLUB',
      });

      expect(result).toEqual([measurement]);
      expect(measurementFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          type: undefined,
          date: { gte: undefined, lte: undefined },
        },
        orderBy: { date: 'asc' },
      });
    });

    it('applique le filtre par type et par plage de dates transmis en query', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindMany.mockResolvedValue([measurement]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-06-30');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 999, scope: 'CLUB' },
        { type: 'HEIGHT', dateFrom, dateTo },
      );

      expect(measurementFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          type: 'HEIGHT',
          date: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { date: 'asc' },
      });
    });

    it('trie par la colonne et le sens demandés (décision du 2026-07-06 : tri toujours côté backend)', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindMany.mockResolvedValue([measurement]);

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 999, scope: 'CLUB' },
        { sortBy: 'value', sortOrder: 'desc' },
      );

      expect(measurementFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          type: undefined,
          date: { gte: undefined, lte: undefined },
        },
        orderBy: { value: 'desc' },
      });
    });

    it("scope OWN : refuse l'accès aux mesures d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(measurementFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : autorise la lecture de ses propres mesures', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindMany.mockResolvedValue([measurement]);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 42, scope: 'OWN' }),
      ).resolves.toEqual([measurement]);
    });
  });

  describe('remove', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 100, 1)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(measurementDelete).not.toHaveBeenCalled();
    });

    it("renvoie 404 si la mesure n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 100, 1)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(measurementDelete).not.toHaveBeenCalled();
    });

    it('supprime la mesure trouvée', async () => {
      playerFindFirst.mockResolvedValue(player);
      measurementFindFirst.mockResolvedValue(measurement);

      await service.remove(1, 100, 1);

      expect(measurementDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});
