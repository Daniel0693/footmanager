import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MatchEventsService } from './match-events.service';

describe('MatchEventsService', () => {
  let teamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let externalPlayerFindFirst: jest.Mock;
  let eventFindFirst: jest.Mock;
  let eventFindMany: jest.Mock;
  let eventCreate: jest.Mock;
  let eventUpdate: jest.Mock;
  let eventDelete: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: MatchEventsService;
  let prismaStub: PrismaService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    matchFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 900, homeOrAway: 'HOME' });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    externalPlayerFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    eventFindFirst = jest.fn();
    eventFindMany = jest.fn().mockResolvedValue([]);
    eventCreate = jest.fn().mockResolvedValue({ id: 1 });
    eventUpdate = jest.fn().mockResolvedValue({ id: 1 });
    eventDelete = jest.fn();

    prismaStub = {
      team: { findFirst: teamFindFirst },
      match: { findFirst: matchFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
      externalPlayer: { findFirst: externalPlayerFindFirst },
      matchEvent: {
        findFirst: eventFindFirst,
        findMany: eventFindMany,
        create: eventCreate,
        update: eventUpdate,
        delete: eventDelete,
      },
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new MatchEventsService(prismaStub, permissionsStub);
  });

  describe('create — notre équipe (teamSide === match.homeOrAway)', () => {
    it('GOAL : playerId requis, relatedPlayerId (passeur) autorisé', async () => {
      await service.create(1, 5, 900, {
        type: 'GOAL',
        teamSide: 'HOME',
        playerId: 10,
        relatedPlayerId: 11,
      });

      expect(playerTeamFindFirst).toHaveBeenCalledTimes(2);
      expect(eventCreate).toHaveBeenCalledWith({
        data: {
          matchId: 900,
          type: 'GOAL',
          teamSide: 'HOME',
          periodNumber: undefined,
          minute: undefined,
          playerId: 10,
          relatedPlayerId: 11,
          externalPlayerId: undefined,
          comment: undefined,
        },
      });
    });

    it('GOAL sans playerId est rejeté', async () => {
      await expect(
        service.create(1, 5, 900, { type: 'GOAL', teamSide: 'HOME' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('GOAL avec externalPlayerId est rejeté (notre équipe, jamais d’ExternalPlayer)', async () => {
      await expect(
        service.create(1, 5, 900, {
          type: 'GOAL',
          teamSide: 'HOME',
          playerId: 10,
          externalPlayerId: 99,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('YELLOW_CARD avec relatedPlayerId est rejeté (permis seulement pour GOAL)', async () => {
      await expect(
        service.create(1, 5, 900, {
          type: 'YELLOW_CARD',
          teamSide: 'HOME',
          playerId: 10,
          relatedPlayerId: 11,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('SUBSTITUTION requiert playerId (entrant) ET relatedPlayerId (sortant)', async () => {
      await expect(
        service.create(1, 5, 900, {
          type: 'SUBSTITUTION',
          teamSide: 'HOME',
          playerId: 10,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();

      await service.create(1, 5, 900, {
        type: 'SUBSTITUTION',
        teamSide: 'HOME',
        playerId: 10,
        relatedPlayerId: 11,
      });
      expect(eventCreate).toHaveBeenCalled();
    });

    it('rejette un playerId qui n’appartient pas à l’équipe', async () => {
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, 900, {
          type: 'GOAL',
          teamSide: 'HOME',
          playerId: 10,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  describe('create — adversaire (teamSide !== match.homeOrAway)', () => {
    it('GOAL adverse sans externalPlayerId est accepté (retour utilisateur du 2026-07-18)', async () => {
      await service.create(1, 5, 900, { type: 'GOAL', teamSide: 'AWAY' });

      expect(eventCreate).toHaveBeenCalledWith({
        data: {
          matchId: 900,
          type: 'GOAL',
          teamSide: 'AWAY',
          periodNumber: undefined,
          minute: undefined,
          playerId: undefined,
          relatedPlayerId: undefined,
          externalPlayerId: undefined,
          comment: undefined,
        },
      });
    });

    it('GOAL adverse avec externalPlayerId scopé au club est accepté', async () => {
      await service.create(1, 5, 900, {
        type: 'GOAL',
        teamSide: 'AWAY',
        externalPlayerId: 7,
      });

      expect(externalPlayerFindFirst).toHaveBeenCalledWith({
        where: { id: 7, clubId: 1 },
      });
      expect(eventCreate).toHaveBeenCalled();
    });

    it('rejette un externalPlayerId hors du club', async () => {
      externalPlayerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, 900, {
          type: 'GOAL',
          teamSide: 'AWAY',
          externalPlayerId: 7,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('rejette playerId côté adversaire (jamais nos joueurs pour un événement adverse)', async () => {
      await expect(
        service.create(1, 5, 900, {
          type: 'GOAL',
          teamSide: 'AWAY',
          playerId: 10,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('rejette SUBSTITUTION/OWN_GOAL/PENALTY côté adversaire (réservés à notre équipe)', async () => {
      for (const type of [
        'OWN_GOAL',
        'SUBSTITUTION',
        'PENALTY_SCORED',
        'PENALTY_MISSED',
      ] as const) {
        await expect(
          service.create(1, 5, 900, { type, teamSide: 'AWAY' }),
        ).rejects.toBeInstanceOf(AppException);
      }
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('re-valide les références fusionnées avec l’événement existant (type/teamSide immuables)', async () => {
      eventFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        type: 'GOAL',
        teamSide: 'HOME',
        playerId: 10,
        relatedPlayerId: null,
        externalPlayerId: null,
      });

      await service.update(1, 5, 900, 1, { minute: 23 });

      expect(playerTeamFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: 10, teamId: 5, leaveDate: null },
        }),
      );
      expect(eventUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          periodNumber: undefined,
          minute: 23,
          playerId: undefined,
          relatedPlayerId: undefined,
          externalPlayerId: undefined,
          comment: undefined,
        },
      });
    });

    it('rejette si la correction retire le playerId requis', async () => {
      eventFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        type: 'GOAL',
        teamSide: 'HOME',
        playerId: 10,
        relatedPlayerId: null,
        externalPlayerId: null,
      });

      await expect(
        service.update(1, 5, 900, 1, { playerId: undefined }),
      ).resolves.toBeDefined(); // playerId non fourni = conserve l'existant (10), toujours valide

      await expect(
        service.update(1, 5, 900, 1, { playerId: null as unknown as number }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('renvoie 404 si l’événement est introuvable pour ce match', async () => {
      eventFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 900, 1, { minute: 10 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(eventUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByMatch', () => {
    it('renvoie 404 si le match n’appartient pas à l’équipe', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByMatch(1, 5, 900, 42),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('liste les événements triés par période puis minute, avec canManage', async () => {
      eventFindMany.mockResolvedValue([{ id: 1, matchId: 900, type: 'GOAL' }]);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result).toEqual({
        data: [{ id: 1, matchId: 900, type: 'GOAL' }],
        canManage: true,
      });
      expect(eventFindMany).toHaveBeenCalledWith({
        where: { matchId: 900 },
        orderBy: [{ periodNumber: 'asc' }, { minute: 'asc' }, { id: 'asc' }],
      });
    });

    it('canManage=false pour un membre sans droit (ex. AdminClub, READ seul)', async () => {
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result.canManage).toBe(false);
    });
  });

  describe('remove', () => {
    it('supprime un événement du match', async () => {
      eventFindFirst.mockResolvedValue({ id: 1, matchId: 900 });

      await service.remove(1, 5, 900, 1);

      expect(eventDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('renvoie 404 si l’événement est introuvable', async () => {
      eventFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(eventDelete).not.toHaveBeenCalled();
    });
  });
});
