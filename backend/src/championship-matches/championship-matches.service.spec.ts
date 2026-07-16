import { HttpStatus } from '@nestjs/common';
import type { Championship, ChampionshipMatch, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ChampionshipMatchesService } from './championship-matches.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15',
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
  tiebreakerRules: ['GOAL_DIFFERENCE'],
  tiebreakerPreset: null,
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const homeParticipant = { id: 1, championshipId: 100 };
const awayParticipant = { id: 2, championshipId: 100 };

const match: ChampionshipMatch = {
  id: 900,
  championshipId: 100,
  homeParticipantId: 1,
  awayParticipantId: 2,
  scheduledAt: new Date('2026-09-15T15:00:00Z'),
  scoreHome: null,
  scoreAway: null,
  status: 'SCHEDULED',
  round: 1,
  numberOfPeriods: null,
  periodDurationMinutes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ChampionshipMatchesService', () => {
  let teamFindFirst: jest.Mock;
  let championshipFindFirst: jest.Mock;
  let participantFindFirst: jest.Mock;
  let participantFindUniqueOrThrow: jest.Mock;
  let matchFindFirst: jest.Mock;
  let matchFindMany: jest.Mock;
  let matchCreate: jest.Mock;
  let matchUpdate: jest.Mock;
  let matchDelete: jest.Mock;
  let linkedMatchFindUnique: jest.Mock;
  let linkedMatchCreate: jest.Mock;
  let linkedMatchDelete: jest.Mock;
  let eventCreate: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: ChampionshipMatchesService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    championshipFindFirst = jest.fn().mockResolvedValue(championship);
    participantFindFirst = jest
      .fn()
      .mockImplementation(({ where: { id } }: { where: { id: number } }) =>
        Promise.resolve(
          [homeParticipant, awayParticipant].find((p) => p.id === id) ?? null,
        ),
      );
    // Participants sans internalTeamId (ownTeamId = 5 du fixture
    // `championship`) : createLinkedMatchIfOwnTeamInvolved ne trouve jamais
    // notre équipe et n'a donc aucun effet dans ces tests génériques — la
    // liaison Match/Event est testée spécifiquement plus bas (A3).
    participantFindUniqueOrThrow = jest
      .fn()
      .mockImplementation(({ where: { id } }: { where: { id: number } }) =>
        Promise.resolve(
          [homeParticipant, awayParticipant].find((p) => p.id === id) ?? null,
        ),
      );
    matchFindFirst = jest.fn().mockResolvedValue(match);
    matchFindMany = jest.fn();
    matchCreate = jest.fn();
    matchUpdate = jest.fn();
    matchDelete = jest.fn();
    linkedMatchFindUnique = jest.fn().mockResolvedValue(null);
    linkedMatchCreate = jest.fn();
    linkedMatchDelete = jest.fn();
    eventCreate = jest.fn().mockResolvedValue({ id: 300 });
    eventUpdate = jest.fn();
    eventDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      championship: { findFirst: championshipFindFirst },
      championshipParticipant: {
        findFirst: participantFindFirst,
        findUniqueOrThrow: participantFindUniqueOrThrow,
      },
      championshipMatch: {
        findFirst: matchFindFirst,
        findMany: matchFindMany,
        create: matchCreate,
        update: matchUpdate,
        delete: matchDelete,
      },
      match: {
        findUnique: linkedMatchFindUnique,
        create: linkedMatchCreate,
        delete: linkedMatchDelete,
      },
      event: { create: eventCreate, update: eventUpdate, delete: eventDelete },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new ChampionshipMatchesService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('planifie une rencontre', async () => {
      matchCreate.mockResolvedValue(match);

      const result = await service.create(1, 5, 100, {
        homeParticipantId: 1,
        awayParticipantId: 2,
        scheduledAt: match.scheduledAt,
        round: 1,
      });

      const participantSelect = {
        id: true,
        internalTeam: { select: { id: true, name: true } },
        externalTeam: { select: { id: true, name: true } },
      };

      expect(result).toBe(match);
      expect(matchCreate).toHaveBeenCalledWith({
        data: {
          championshipId: 100,
          homeParticipantId: 1,
          awayParticipantId: 2,
          scheduledAt: match.scheduledAt,
          round: 1,
          numberOfPeriods: undefined,
          periodDurationMinutes: undefined,
        },
        include: {
          homeParticipant: { select: participantSelect },
          awayParticipant: { select: participantSelect },
        },
      });
    });

    it('refuse si les deux participants sont identiques', async () => {
      await expect(
        service.create(1, 5, 100, {
          homeParticipantId: 1,
          awayParticipantId: 1,
          scheduledAt: match.scheduledAt,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchCreate).not.toHaveBeenCalled();
    });

    it("refuse un participant qui n'appartient pas à ce championnat", async () => {
      await expect(
        service.create(1, 5, 100, {
          homeParticipantId: 1,
          awayParticipantId: 999,
          scheduledAt: match.scheduledAt,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(matchCreate).not.toHaveBeenCalled();
    });
  });

  describe('createBulk', () => {
    it('crée toutes les rencontres en une transaction', async () => {
      matchCreate.mockResolvedValue(match);

      const result = await service.createBulk(1, 5, 100, [
        {
          homeParticipantId: 1,
          awayParticipantId: 2,
          scheduledAt: match.scheduledAt,
          round: 1,
        },
        {
          homeParticipantId: 2,
          awayParticipantId: 1,
          scheduledAt: match.scheduledAt,
          round: 2,
        },
      ]);

      expect(result).toEqual([match, match]);
      expect(matchCreate).toHaveBeenCalledTimes(2);
    });

    it('refuse tout le lot si une ligne a deux participants identiques', async () => {
      await expect(
        service.createBulk(1, 5, 100, [
          {
            homeParticipantId: 1,
            awayParticipantId: 2,
            scheduledAt: match.scheduledAt,
          },
          {
            homeParticipantId: 1,
            awayParticipantId: 1,
            scheduledAt: match.scheduledAt,
          },
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchCreate).not.toHaveBeenCalled();
    });

    it('refuse tout le lot si une ligne référence un participant hors du championnat', async () => {
      await expect(
        service.createBulk(1, 5, 100, [
          {
            homeParticipantId: 1,
            awayParticipantId: 2,
            scheduledAt: match.scheduledAt,
          },
          {
            homeParticipantId: 1,
            awayParticipantId: 999,
            scheduledAt: match.scheduledAt,
          },
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(matchCreate).not.toHaveBeenCalled();
    });

    it('renvoie 404 si le championnat est introuvable', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(
        service.createBulk(1, 5, 100, [
          {
            homeParticipantId: 1,
            awayParticipantId: 2,
            scheduledAt: match.scheduledAt,
          },
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(matchCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByChampionship', () => {
    it('liste les rencontres, triées par journée puis date', async () => {
      matchFindMany.mockResolvedValue([match]);

      const result = await service.findAllByChampionship(1, 5, 100, 42);

      const participantSelect = {
        id: true,
        internalTeam: { select: { id: true, name: true } },
        externalTeam: { select: { id: true, name: true } },
      };

      expect(result).toEqual({ data: [match], canManage: true });
      expect(matchFindMany).toHaveBeenCalledWith({
        where: { championshipId: 100, status: undefined },
        include: {
          homeParticipant: { select: participantSelect },
          awayParticipant: { select: participantSelect },
        },
        orderBy: [{ round: 'asc' }, { scheduledAt: 'asc' }],
      });
    });

    it('canManage reflète CREATE sur `championship_match` (Player en lecture seule)', async () => {
      matchFindMany.mockResolvedValue([]);
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByChampionship(1, 5, 100, 42);

      expect(permissionsCan).toHaveBeenCalledWith(
        42,
        'CREATE',
        'championship_match',
        { clubId: 1, teamId: 5 },
      );
      expect(result.canManage).toBe(false);
    });
  });

  describe('update', () => {
    it('renvoie 404 si la rencontre est introuvable', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 100, 900, { status: 'CANCELLED' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(matchUpdate).not.toHaveBeenCalled();
    });

    it('modifie une rencontre planifiée (date, journée)', async () => {
      matchUpdate.mockResolvedValue({ ...match, round: 2 });

      const result = await service.update(1, 5, 100, 900, { round: 2 });

      expect(result.round).toBe(2);
      expect(matchUpdate).toHaveBeenCalled();
    });

    it('refuse le passage à FINISHED sans score complet', async () => {
      await expect(
        service.update(1, 5, 100, 900, { status: 'FINISHED' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchUpdate).not.toHaveBeenCalled();
    });

    it('refuse le passage à FINISHED avec un seul des deux scores', async () => {
      await expect(
        service.update(1, 5, 100, 900, { status: 'FINISHED', scoreHome: 2 }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchUpdate).not.toHaveBeenCalled();
    });

    it('autorise le passage à FINISHED avec les deux scores fournis', async () => {
      matchUpdate.mockResolvedValue({
        ...match,
        status: 'FINISHED',
        scoreHome: 2,
        scoreAway: 1,
      });

      const result = await service.update(1, 5, 100, 900, {
        status: 'FINISHED',
        scoreHome: 2,
        scoreAway: 1,
      });

      expect(result.status).toBe('FINISHED');
      expect(matchUpdate).toHaveBeenCalled();
    });

    it('autorise FINISHED si les scores étaient déjà persistés sur la rencontre', async () => {
      matchFindFirst.mockResolvedValue({
        ...match,
        scoreHome: 3,
        scoreAway: 0,
      });
      matchUpdate.mockResolvedValue({
        ...match,
        status: 'FINISHED',
        scoreHome: 3,
        scoreAway: 0,
      });

      await service.update(1, 5, 100, 900, { status: 'FINISHED' });

      expect(matchUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('renvoie 404 si la rencontre est introuvable', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 100, 900)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(matchDelete).not.toHaveBeenCalled();
    });

    it('supprime une rencontre existante', async () => {
      await service.remove(1, 5, 100, 900);

      expect(matchDelete).toHaveBeenCalledWith({ where: { id: 900 } });
    });
  });

  // Liaison Calendrier (Phase 4, A3, docs/modules/matchs.md) : Event+Match
  // créés automatiquement uniquement si l'une des deux équipes EST notre
  // équipe propriétaire (championship.teamId = 5, fixture ci-dessus).
  describe('liaison Match/Event (A3)', () => {
    const ownParticipant = {
      id: 1,
      championshipId: 100,
      internalTeamId: 5,
      internalTeam: null,
      externalTeamId: null,
      externalTeam: null,
    };
    const opponentParticipant = {
      id: 2,
      championshipId: 100,
      internalTeamId: null,
      internalTeam: null,
      externalTeamId: 20,
      externalTeam: { id: 20, name: 'FC Rivals' },
    };

    beforeEach(() => {
      participantFindFirst.mockImplementation(
        ({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(
            [ownParticipant, opponentParticipant].find((p) => p.id === id) ??
              null,
          ),
      );
      participantFindUniqueOrThrow.mockImplementation(
        ({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(
            [ownParticipant, opponentParticipant].find((p) => p.id === id) ??
              null,
          ),
      );
    });

    it('crée Event+Match quand notre équipe est participante (create)', async () => {
      matchCreate.mockResolvedValue(match);

      await service.create(1, 5, 100, {
        homeParticipantId: 1,
        awayParticipantId: 2,
        scheduledAt: match.scheduledAt,
      });

      expect(eventCreate).toHaveBeenCalledWith({
        data: {
          teamId: 5,
          type: 'MATCH',
          title: 'FC Rivals',
          startAt: match.scheduledAt,
        },
      });
      expect(linkedMatchCreate).toHaveBeenCalledWith({
        data: {
          eventId: 300,
          championshipMatchId: 900,
          matchType: 'CHAMPIONNAT',
          homeOrAway: 'HOME',
          numberOfPeriods: null,
          periodDurationMinutes: null,
        },
      });
    });

    it("ne crée aucun Event+Match si aucune de nos équipes n'est participante", async () => {
      const otherOpponent = { ...opponentParticipant, id: 3 };
      participantFindFirst.mockImplementation(
        ({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(
            [opponentParticipant, otherOpponent].find((p) => p.id === id) ??
              null,
          ),
      );
      participantFindUniqueOrThrow.mockImplementation(
        ({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(
            [opponentParticipant, otherOpponent].find((p) => p.id === id) ??
              null,
          ),
      );
      matchCreate.mockResolvedValue({
        ...match,
        homeParticipantId: 2,
        awayParticipantId: 3,
      });

      await service.create(1, 5, 100, {
        homeParticipantId: 2,
        awayParticipantId: 3,
        scheduledAt: match.scheduledAt,
      });

      expect(eventCreate).not.toHaveBeenCalled();
      expect(linkedMatchCreate).not.toHaveBeenCalled();
    });

    it('répercute un changement de date sur l’Event lié (update)', async () => {
      linkedMatchFindUnique.mockResolvedValue({ eventId: 300 });
      matchUpdate.mockResolvedValue({
        ...match,
        scheduledAt: new Date('2026-09-20T15:00:00Z'),
      });

      await service.update(1, 5, 100, 900, {
        scheduledAt: new Date('2026-09-20T15:00:00Z'),
      });

      expect(eventUpdate).toHaveBeenCalledWith({
        where: { id: 300 },
        data: { startAt: new Date('2026-09-20T15:00:00Z') },
      });
    });

    it('supprime le Match+Event lié avant la rencontre (remove)', async () => {
      linkedMatchFindUnique.mockResolvedValue({ id: 901, eventId: 300 });

      await service.remove(1, 5, 100, 900);

      expect(linkedMatchDelete).toHaveBeenCalledWith({ where: { id: 901 } });
      expect(eventDelete).toHaveBeenCalledWith({ where: { id: 300 } });
      expect(matchDelete).toHaveBeenCalledWith({ where: { id: 900 } });
    });
  });
});
