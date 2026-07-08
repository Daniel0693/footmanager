import { HttpStatus } from '@nestjs/common';
import type { Event, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const trainingEvent: Event = {
  id: 300,
  teamId: 5,
  type: 'TRAINING',
  title: 'Entraînement technique',
  startAt: new Date('2026-07-10T18:00:00Z'),
  endAt: new Date('2026-07-10T19:30:00Z'),
  location: 'Stade municipal',
  description: null,
  isRecurring: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('EventsService', () => {
  let teamFindFirst: jest.Mock;
  let eventFindFirst: jest.Mock;
  let eventFindMany: jest.Mock;
  let eventCreate: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;
  let service: EventsService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    eventFindFirst = jest.fn();
    eventFindMany = jest.fn();
    eventCreate = jest.fn();
    eventUpdate = jest.fn();
    eventDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      event: {
        findFirst: eventFindFirst,
        findMany: eventFindMany,
        create: eventCreate,
        update: eventUpdate,
        delete: eventDelete,
      },
    } as unknown as PrismaService;

    service = new EventsService(prismaStub);
  });

  describe('create', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, {
          type: 'TRAINING',
          title: 'Entraînement',
          startAt: new Date('2026-07-10T18:00:00Z'),
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('crée l’événement quand l’équipe appartient au club', async () => {
      teamFindFirst.mockResolvedValue(team);
      eventCreate.mockResolvedValue(trainingEvent);

      const result = await service.create(1, 5, {
        type: 'TRAINING',
        title: 'Entraînement technique',
        startAt: trainingEvent.startAt,
        endAt: trainingEvent.endAt!,
        location: 'Stade municipal',
      });

      expect(result).toBe(trainingEvent);
      expect(eventCreate).toHaveBeenCalledWith({
        data: {
          teamId: 5,
          type: 'TRAINING',
          title: 'Entraînement technique',
          startAt: trainingEvent.startAt,
          endAt: trainingEvent.endAt,
          location: 'Stade municipal',
          description: undefined,
        },
      });
    });
  });

  describe('findAllByTeam', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(service.findAllByTeam(1, 5)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(eventFindMany).not.toHaveBeenCalled();
    });

    it('filtre par type et plage de dates, trié par startAt', async () => {
      teamFindFirst.mockResolvedValue(team);
      eventFindMany.mockResolvedValue([trainingEvent]);

      const dateFrom = new Date('2026-07-01');
      const dateTo = new Date('2026-07-31');
      const result = await service.findAllByTeam(1, 5, {
        type: 'TRAINING',
        dateFrom,
        dateTo,
      });

      expect(result).toEqual([trainingEvent]);
      expect(eventFindMany).toHaveBeenCalledWith({
        where: {
          teamId: 5,
          type: 'TRAINING',
          startAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { startAt: 'asc' },
      });
    });

    it('respecte sortOrder desc', async () => {
      teamFindFirst.mockResolvedValue(team);
      eventFindMany.mockResolvedValue([]);

      await service.findAllByTeam(1, 5, { sortOrder: 'desc' });

      expect(eventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startAt: 'desc' } }),
      );
    });
  });

  describe('update', () => {
    it("renvoie 404 si l'événement est introuvable dans cette équipe/club", async () => {
      eventFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 300, { title: 'Nouveau titre' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(eventUpdate).not.toHaveBeenCalled();
    });

    it('modifie l’événement trouvé', async () => {
      eventFindFirst.mockResolvedValue(trainingEvent);
      eventUpdate.mockResolvedValue({
        ...trainingEvent,
        title: 'Nouveau titre',
      });

      const result = await service.update(1, 5, 300, {
        title: 'Nouveau titre',
      });

      expect(result.title).toBe('Nouveau titre');
      expect(eventUpdate).toHaveBeenCalledWith({
        where: { id: 300 },
        data: {
          type: undefined,
          title: 'Nouveau titre',
          startAt: undefined,
          endAt: undefined,
          location: undefined,
          description: undefined,
        },
      });
    });
  });

  describe('remove', () => {
    it("renvoie 404 si l'événement est introuvable", async () => {
      eventFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 300)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(eventDelete).not.toHaveBeenCalled();
    });

    it('supprime l’événement trouvé', async () => {
      eventFindFirst.mockResolvedValue(trainingEvent);

      await service.remove(1, 5, 300);

      expect(eventDelete).toHaveBeenCalledWith({ where: { id: 300 } });
    });
  });
});
