import { HttpStatus } from '@nestjs/common';
import type { Event, Member, Team } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { EventsService } from './events.service';

const member: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
  recurringGroupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const recurringAnchorEvent: Event = {
  id: 301,
  teamId: 5,
  type: 'TRAINING',
  title: 'Entraînement hebdomadaire',
  startAt: new Date('2026-07-13T17:30:00Z'),
  endAt: new Date('2026-07-13T19:00:00Z'),
  location: 'Ecossia',
  description: null,
  isRecurring: true,
  recurringGroupId: 'a1b2c3d4-0000-4000-8000-000000000000',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('EventsService', () => {
  let teamFindFirst: jest.Mock;
  let eventFindFirst: jest.Mock;
  let eventFindMany: jest.Mock;
  let eventCreate: jest.Mock;
  let eventCreateMany: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;
  let eventDeleteMany: jest.Mock;
  let transaction: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let can: jest.Mock;
  let service: EventsService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    eventFindFirst = jest.fn();
    eventFindMany = jest.fn();
    eventCreate = jest.fn();
    eventCreateMany = jest.fn();
    eventUpdate = jest.fn();
    eventDelete = jest.fn();
    eventDeleteMany = jest.fn();
    // Les opérations sont déjà des Promises construites par le .map() du
    // service au moment de l'appel — $transaction n'a qu'à toutes les
    // attendre, comme le fait réellement Prisma pour un tableau de requêtes.
    transaction = jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      event: {
        findFirst: eventFindFirst,
        findMany: eventFindMany,
        create: eventCreate,
        createMany: eventCreateMany,
        update: eventUpdate,
        delete: eventDelete,
        deleteMany: eventDeleteMany,
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    findByUserAndClub = jest.fn();
    const membersServiceStub = {
      findByUserAndClub,
    } as unknown as MembersService;

    can = jest.fn();
    const permissionsServiceStub = { can } as unknown as PermissionsService;

    service = new EventsService(
      prismaStub,
      membersServiceStub,
      permissionsServiceStub,
    );
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

  describe('createBulk', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.createBulk(1, 5, [
          {
            type: 'TRAINING',
            title: 'Entraînement',
            startAt: new Date('2026-07-06T17:30:00Z'),
          },
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(eventCreateMany).not.toHaveBeenCalled();
    });

    it('crée toutes les occurrences en une seule requête, marquées isRecurring', async () => {
      teamFindFirst.mockResolvedValue(team);
      eventCreateMany.mockResolvedValue({ count: 2 });

      const occurrences = [
        {
          type: 'TRAINING' as const,
          title: 'Entraînement',
          startAt: new Date('2026-07-06T17:30:00Z'),
          endAt: new Date('2026-07-06T19:00:00Z'),
          location: 'Ecossia',
        },
        {
          type: 'TRAINING' as const,
          title: 'Entraînement',
          startAt: new Date('2026-07-08T17:30:00Z'),
          endAt: new Date('2026-07-08T19:00:00Z'),
          location: 'Ecossia',
        },
      ];

      await service.createBulk(1, 5, occurrences);

      expect(eventCreateMany).toHaveBeenCalledTimes(1);
      const [{ data }] = eventCreateMany.mock.calls[0] as [
        { data: { recurringGroupId: string }[] },
      ];
      expect(data).toEqual(
        occurrences.map((occurrence) => ({
          teamId: 5,
          type: occurrence.type,
          title: occurrence.title,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          location: occurrence.location,
          description: undefined,
          isRecurring: true,
          recurringGroupId: data[0].recurringGroupId,
        })),
      );
      // Même identifiant de lot sur toutes les occurrences.
      expect(data[0].recurringGroupId).toEqual(expect.any(String));
      expect(data[1].recurringGroupId).toBe(data[0].recurringGroupId);
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

  describe('findMineInClub', () => {
    it("refuse si l'appelant n'a pas de fiche membre dans ce club", async () => {
      findByUserAndClub.mockResolvedValue(null);

      await expect(service.findMineInClub(1, 7)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
      expect(eventFindMany).not.toHaveBeenCalled();
    });

    it('scope club-entier (AdminClub/SuperAdmin) : voit les événements de toutes les équipes du club', async () => {
      findByUserAndClub.mockResolvedValue(member);
      can.mockResolvedValue('CLUB');
      eventFindMany.mockResolvedValue([trainingEvent]);

      const result = await service.findMineInClub(1, 7);

      expect(result).toEqual([trainingEvent]);
      expect(can).toHaveBeenCalledWith(42, 'READ', 'event', { clubId: 1 });
      expect(eventFindMany).toHaveBeenCalledWith({
        where: {
          team: { clubId: 1 },
          type: undefined,
          startAt: { gte: undefined, lte: undefined },
        },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      });
    });

    it('scope équipe (Coach/Player) : ne voit que les événements de ses propres équipes', async () => {
      findByUserAndClub.mockResolvedValue(member);
      can.mockResolvedValue(null);
      eventFindMany.mockResolvedValue([trainingEvent]);

      const result = await service.findMineInClub(1, 7, { types: ['MATCH'] });

      expect(result).toEqual([trainingEvent]);
      expect(eventFindMany).toHaveBeenCalledWith({
        where: {
          team: {
            clubId: 1,
            memberRoles: {
              some: { memberId: 42, teamId: { not: null } },
            },
          },
          type: { in: ['MATCH'] },
          startAt: { gte: undefined, lte: undefined },
        },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      });
    });

    it('filtre `teamIds` (case à cocher équipe) : restreint encore les équipes accessibles', async () => {
      findByUserAndClub.mockResolvedValue(member);
      can.mockResolvedValue('CLUB');
      eventFindMany.mockResolvedValue([trainingEvent]);

      await service.findMineInClub(1, 7, { teamIds: [5, 8] });

      expect(eventFindMany).toHaveBeenCalledWith({
        where: {
          team: { clubId: 1, id: { in: [5, 8] } },
          type: undefined,
          startAt: { gte: undefined, lte: undefined },
        },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      });
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

      expect((result as Event).title).toBe('Nouveau titre');
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

    describe('scope future', () => {
      it('propage titre/type/lieu/description/heure aux occurrences suivantes en préservant leur date', async () => {
        eventFindFirst.mockResolvedValue(recurringAnchorEvent);
        const nextOccurrence: Event = {
          ...recurringAnchorEvent,
          id: 302,
          startAt: new Date('2026-07-20T17:30:00Z'),
          endAt: new Date('2026-07-20T19:00:00Z'),
        };
        eventFindMany.mockResolvedValue([recurringAnchorEvent, nextOccurrence]);
        eventUpdate.mockResolvedValue({});

        const result = await service.update(
          1,
          5,
          301,
          {
            title: 'Entraînement renforcé',
            startAt: new Date('2026-07-13T18:00:00Z'),
            endAt: new Date('2026-07-13T19:30:00Z'),
          },
          'future',
        );

        expect(eventFindMany).toHaveBeenCalledWith({
          where: {
            teamId: 5,
            recurringGroupId: recurringAnchorEvent.recurringGroupId,
            startAt: { gte: recurringAnchorEvent.startAt },
          },
        });

        expect(transaction).toHaveBeenCalledTimes(1);
        expect(eventUpdate).toHaveBeenCalledTimes(2);
        expect(eventUpdate).toHaveBeenNthCalledWith(1, {
          where: { id: recurringAnchorEvent.id },
          data: {
            type: undefined,
            title: 'Entraînement renforcé',
            // Heure recalculée (18h00) mais date d'origine (13/07) préservée.
            startAt: new Date('2026-07-13T18:00:00Z'),
            endAt: new Date('2026-07-13T19:30:00Z'),
            location: undefined,
            description: undefined,
          },
        });
        expect(eventUpdate).toHaveBeenNthCalledWith(2, {
          where: { id: nextOccurrence.id },
          data: {
            type: undefined,
            title: 'Entraînement renforcé',
            // Même heure appliquée, mais date du 20/07 préservée (pas celle de l'ancre).
            startAt: new Date('2026-07-20T18:00:00Z'),
            endAt: new Date('2026-07-20T19:30:00Z'),
            location: undefined,
            description: undefined,
          },
        });
        expect(result).toEqual({ count: 2 });
      });

      it("retombe sur une édition simple si l'événement ne fait pas partie d'un lot récurrent", async () => {
        eventFindFirst.mockResolvedValue(trainingEvent);
        eventUpdate.mockResolvedValue({
          ...trainingEvent,
          title: 'Nouveau titre',
        });

        const result = await service.update(
          1,
          5,
          300,
          { title: 'Nouveau titre' },
          'future',
        );

        expect(eventFindMany).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
        expect(eventUpdate).toHaveBeenCalledTimes(1);
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
        expect((result as Event).title).toBe('Nouveau titre');
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

    describe('scope future', () => {
      it('supprime cette occurrence et toutes les suivantes du même lot récurrent', async () => {
        eventFindFirst.mockResolvedValue(recurringAnchorEvent);
        eventDeleteMany.mockResolvedValue({ count: 3 });

        await service.remove(1, 5, 301, 'future');

        expect(eventDeleteMany).toHaveBeenCalledWith({
          where: {
            teamId: 5,
            recurringGroupId: recurringAnchorEvent.recurringGroupId,
            startAt: { gte: recurringAnchorEvent.startAt },
          },
        });
        expect(eventDelete).not.toHaveBeenCalled();
      });

      it("retombe sur une suppression simple si l'événement ne fait pas partie d'un lot récurrent", async () => {
        eventFindFirst.mockResolvedValue(trainingEvent);

        await service.remove(1, 5, 300, 'future');

        expect(eventDeleteMany).not.toHaveBeenCalled();
        expect(eventDelete).toHaveBeenCalledWith({ where: { id: 300 } });
      });
    });
  });
});
