import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MatchLineupsService } from './match-lineups.service';

describe('MatchLineupsService', () => {
  let teamFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let lineupFindFirst: jest.Mock;
  let lineupFindMany: jest.Mock;
  let lineupUpsert: jest.Mock;
  let lineupDelete: jest.Mock;
  let transaction: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: MatchLineupsService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    matchFindFirst = jest.fn().mockResolvedValue({ id: 900 });
    lineupFindFirst = jest.fn();
    lineupFindMany = jest.fn().mockResolvedValue([]);
    lineupUpsert = jest.fn();
    lineupDelete = jest.fn();
    transaction = jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
      match: { findFirst: matchFindFirst },
      matchLineup: {
        findFirst: lineupFindFirst,
        findMany: lineupFindMany,
        upsert: lineupUpsert,
        delete: lineupDelete,
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new MatchLineupsService(prismaStub, permissionsStub);
  });

  describe('upsertBulk', () => {
    it('upsert chaque ligne sur (matchId, playerId), vérifie l’appartenance à l’équipe', async () => {
      await service.upsertBulk(
        1,
        5,
        900,
        [
          {
            playerId: 10,
            lineupStatus: 'TITULAIRE',
            position: 'ST',
            pitchSpotId: 'st',
            shirtNumber: 9,
          },
          { playerId: 11, lineupStatus: 'REMPLACANT' },
        ],
        42,
      );

      expect(playerTeamFindFirst).toHaveBeenCalledTimes(2);
      expect(lineupUpsert).toHaveBeenCalledWith({
        where: { matchId_playerId: { matchId: 900, playerId: 10 } },
        create: {
          matchId: 900,
          playerId: 10,
          lineupStatus: 'TITULAIRE',
          position: 'ST',
          pitchSpotId: 'st',
          shirtNumber: 9,
        },
        update: {
          lineupStatus: 'TITULAIRE',
          position: 'ST',
          pitchSpotId: 'st',
          shirtNumber: 9,
        },
      });
      expect(lineupUpsert).toHaveBeenCalledWith({
        where: { matchId_playerId: { matchId: 900, playerId: 11 } },
        create: {
          matchId: 900,
          playerId: 11,
          lineupStatus: 'REMPLACANT',
          position: undefined,
          shirtNumber: undefined,
        },
        update: {
          lineupStatus: 'REMPLACANT',
          position: undefined,
          shirtNumber: undefined,
        },
      });
    });

    it('rejette un joueur qui n’appartient pas à l’équipe', async () => {
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.upsertBulk(
          1,
          5,
          900,
          [{ playerId: 10, lineupStatus: 'TITULAIRE' }],
          42,
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(lineupUpsert).not.toHaveBeenCalled();
    });
  });

  describe('findAllByMatch', () => {
    it('renvoie 404 si le match n’appartient pas à l’équipe', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByMatch(1, 5, 900, 42),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('liste la composition du match, avec canManage', async () => {
      lineupFindMany.mockResolvedValue([{ id: 1, matchId: 900, playerId: 10 }]);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result).toEqual({
        data: [{ id: 1, matchId: 900, playerId: 10 }],
        canManage: true,
      });
      expect(lineupFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { matchId: 900 } }),
      );
    });

    it('canManage=false pour un membre sans droit (ex. Player)', async () => {
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result.canManage).toBe(false);
    });
  });

  describe('remove', () => {
    it('retire un joueur de la composition', async () => {
      lineupFindFirst.mockResolvedValue({ id: 1, matchId: 900 });

      await service.remove(1, 5, 900, 1);

      expect(lineupDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('renvoie 404 si la ligne est introuvable', async () => {
      lineupFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(lineupDelete).not.toHaveBeenCalled();
    });
  });
});
