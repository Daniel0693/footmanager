import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  let teamFindFirst: jest.Mock;
  let externalTeamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let eventCreate: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;
  let matchCreate: jest.Mock;
  let matchUpdate: jest.Mock;
  let matchDelete: jest.Mock;
  let matchFindMany: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: MatchesService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    externalTeamFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 20, clubId: 1, name: 'FC Rivals' });
    matchFindFirst = jest.fn();
    eventCreate = jest.fn().mockResolvedValue({ id: 300 });
    eventUpdate = jest.fn().mockResolvedValue({ id: 300 });
    eventDelete = jest.fn();
    matchCreate = jest.fn().mockResolvedValue({ id: 900 });
    matchUpdate = jest.fn().mockResolvedValue({ id: 900 });
    matchDelete = jest.fn();
    matchFindMany = jest.fn().mockResolvedValue([]);

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      externalTeam: { findFirst: externalTeamFindFirst },
      event: { create: eventCreate, update: eventUpdate, delete: eventDelete },
      match: {
        findFirst: matchFindFirst,
        findMany: matchFindMany,
        create: matchCreate,
        update: matchUpdate,
        delete: matchDelete,
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new MatchesService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('crée l’Event puis le Match dans une transaction pour un match Coupe', async () => {
      const startAt = new Date('2026-10-01T18:00:00Z');
      const result = await service.create(1, 5, {
        title: 'Coupe vs FC Rivals',
        startAt,
        matchType: 'COUPE',
        opponentExternalTeamId: 20,
        cupRound: 'ROUND_OF_16',
        homeOrAway: 'HOME',
      });

      expect(eventCreate).toHaveBeenCalledWith({
        data: {
          teamId: 5,
          type: 'MATCH',
          title: 'Coupe vs FC Rivals',
          startAt,
          endAt: undefined,
          location: undefined,
          description: undefined,
        },
      });
      expect(matchCreate).toHaveBeenCalledWith({
        data: {
          eventId: 300,
          matchType: 'COUPE',
          opponentExternalTeamId: 20,
          cupRound: 'ROUND_OF_16',
          homeOrAway: 'HOME',
          numberOfPeriods: undefined,
          periodDurationMinutes: undefined,
        },
        include: {
          event: true,
          opponentExternalTeam: { select: { id: true, name: true } },
        },
      });
      expect(result).toEqual({ id: 900 });
    });

    it('rejette la création directe d’un match CHAMPIONNAT', async () => {
      await expect(
        service.create(1, 5, {
          title: 'Match de championnat',
          startAt: new Date('2026-10-01T18:00:00Z'),
          matchType: 'CHAMPIONNAT',
          opponentExternalTeamId: 20,
          homeOrAway: 'HOME',
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(matchCreate).not.toHaveBeenCalled();
    });

    it('rejette un cupRound renseigné hors matchType = COUPE', async () => {
      await expect(
        service.create(1, 5, {
          title: 'Amical vs FC Rivals',
          startAt: new Date('2026-10-01T18:00:00Z'),
          matchType: 'AMICAL',
          opponentExternalTeamId: 20,
          cupRound: 'FINAL',
          homeOrAway: 'HOME',
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(matchCreate).not.toHaveBeenCalled();
    });

    it('rejette un adversaire qui n’appartient pas au club', async () => {
      externalTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, {
          title: 'Amical vs FC Rivals',
          startAt: new Date('2026-10-01T18:00:00Z'),
          matchType: 'AMICAL',
          opponentExternalTeamId: 999,
          homeOrAway: 'HOME',
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(matchCreate).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('renvoie le match avec canManage', async () => {
      matchFindFirst.mockResolvedValue({ id: 900, matchType: 'AMICAL' });

      const result = await service.findOne(1, 5, 900, 42);

      expect(result).toEqual({ id: 900, matchType: 'AMICAL', canManage: true });
    });

    it('canManage=false pour un membre sans droit de création (ex. Player)', async () => {
      matchFindFirst.mockResolvedValue({ id: 900, matchType: 'AMICAL' });
      permissionsCan.mockResolvedValue(null);

      const result = await service.findOne(1, 5, 900, 42);

      expect(result.canManage).toBe(false);
    });
  });

  describe('update', () => {
    it('rejette la modification de l’adversaire sur un match CHAMPIONNAT', async () => {
      matchFindFirst.mockResolvedValue({
        id: 900,
        eventId: 300,
        matchType: 'CHAMPIONNAT',
      });

      await expect(
        service.update(1, 5, 900, { opponentExternalTeamId: 21 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(matchUpdate).not.toHaveBeenCalled();
    });

    it('rejette un cupRound renseigné sur un match non-Coupe', async () => {
      matchFindFirst.mockResolvedValue({
        id: 900,
        eventId: 300,
        matchType: 'AMICAL',
      });

      await expect(
        service.update(1, 5, 900, { cupRound: 'FINAL' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(matchUpdate).not.toHaveBeenCalled();
    });

    it('modifie titre/date (Event) et adversaire (Match) pour un match Amical', async () => {
      matchFindFirst.mockResolvedValue({
        id: 900,
        eventId: 300,
        matchType: 'AMICAL',
      });

      await service.update(1, 5, 900, {
        title: 'Amical reprogrammé',
        opponentExternalTeamId: 21,
      });

      expect(eventUpdate).toHaveBeenCalledWith({
        where: { id: 300 },
        data: {
          title: 'Amical reprogrammé',
          startAt: undefined,
          endAt: undefined,
          location: undefined,
          description: undefined,
        },
      });
      expect(matchUpdate).toHaveBeenCalledWith({
        where: { id: 900 },
        data: {
          opponentExternalTeamId: 21,
          cupRound: undefined,
          homeOrAway: undefined,
          numberOfPeriods: undefined,
          periodDurationMinutes: undefined,
          formation: undefined,
        },
        include: {
          event: true,
          opponentExternalTeam: { select: { id: true, name: true } },
        },
      });
    });

    it('modifie le système tactique (formation)', async () => {
      matchFindFirst.mockResolvedValue({
        id: 900,
        eventId: 300,
        matchType: 'AMICAL',
      });

      await service.update(1, 5, 900, { formation: '4-3-3' });

      expect(matchUpdate).toHaveBeenCalledWith({
        where: { id: 900 },
        data: {
          opponentExternalTeamId: undefined,
          cupRound: undefined,
          homeOrAway: undefined,
          numberOfPeriods: undefined,
          periodDurationMinutes: undefined,
          formation: '4-3-3',
        },
        include: {
          event: true,
          opponentExternalTeam: { select: { id: true, name: true } },
        },
      });
    });
  });

  describe('remove', () => {
    it('supprime le Match puis l’Event dans une transaction', async () => {
      matchFindFirst.mockResolvedValue({
        id: 900,
        eventId: 300,
        matchType: 'AMICAL',
      });

      await service.remove(1, 5, 900);

      expect(matchDelete).toHaveBeenCalledWith({ where: { id: 900 } });
      expect(eventDelete).toHaveBeenCalledWith({ where: { id: 300 } });
    });
  });

  describe('findAllByTeam', () => {
    it('renvoie data + canManage', async () => {
      const result = await service.findAllByTeam(1, 5, 42);
      expect(result).toEqual({ data: [], canManage: true });
    });

    it('canManage=false pour un membre sans droit de création', async () => {
      permissionsCan.mockResolvedValue(null);
      const result = await service.findAllByTeam(1, 5, 42);
      expect(result.canManage).toBe(false);
    });
  });
});
