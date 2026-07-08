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
  let findByUserAndClub: jest.Mock;
  let can: jest.Mock;
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
