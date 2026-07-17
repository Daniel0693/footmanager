import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MatchPeriodsService } from './match-periods.service';

describe('MatchPeriodsService', () => {
  let teamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let matchUpdate: jest.Mock;
  let periodFindFirst: jest.Mock;
  let periodFindMany: jest.Mock;
  let periodCreate: jest.Mock;
  let periodUpdate: jest.Mock;
  let transaction: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: MatchPeriodsService;
  let prismaStub: PrismaService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    matchFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 900, status: 'SCHEDULED' });
    matchUpdate = jest.fn();
    periodFindFirst = jest.fn().mockResolvedValue(null);
    periodFindMany = jest.fn().mockResolvedValue([]);
    periodCreate = jest
      .fn()
      .mockResolvedValue({ id: 1, matchId: 900, periodNumber: 1 });
    periodUpdate = jest
      .fn()
      .mockResolvedValue({ id: 1, matchId: 900, endedAt: new Date() });
    // Callback interactif `(tx) => ...`, même convention que
    // MatchLineupsService/MatchAttendancesService (voir leurs specs).
    transaction = jest.fn((arg: (tx: PrismaService) => unknown) =>
      arg(prismaStub),
    );

    prismaStub = {
      team: { findFirst: teamFindFirst },
      match: { findFirst: matchFindFirst, update: matchUpdate },
      matchPeriod: {
        findFirst: periodFindFirst,
        findMany: periodFindMany,
        create: periodCreate,
        update: periodUpdate,
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new MatchPeriodsService(prismaStub, permissionsStub);
  });

  describe('startNext', () => {
    it('démarre la période 1 (aucune période existante) et passe le match en LIVE', async () => {
      const result = await service.startNext(1, 5, 900);

      expect(periodCreate).toHaveBeenCalledTimes(1);
      const [createArgs] = periodCreate.mock.calls[0] as [
        { data: { matchId: number; periodNumber: number; startedAt: Date } },
      ];
      expect(createArgs.data.matchId).toBe(900);
      expect(createArgs.data.periodNumber).toBe(1);
      expect(createArgs.data.startedAt).toBeInstanceOf(Date);
      expect(matchUpdate).toHaveBeenCalledWith({
        where: { id: 900 },
        data: { status: 'LIVE' },
      });
      expect(result).toEqual({ id: 1, matchId: 900, periodNumber: 1 });
    });

    it('démarre la période N+1 après la dernière période enregistrée', async () => {
      // findFirst sert 2 requêtes différentes dans startNext : vérifier
      // qu'aucune période n'est ouverte (1er appel), puis retrouver la
      // dernière période enregistrée pour calculer periodNumber (2e appel).
      periodFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ periodNumber: 1 });

      await service.startNext(1, 5, 900);

      const [createArgs] = periodCreate.mock.calls[0] as [
        { data: { matchId: number; periodNumber: number; startedAt: Date } },
      ];
      expect(createArgs.data.matchId).toBe(900);
      expect(createArgs.data.periodNumber).toBe(2);
      expect(createArgs.data.startedAt).toBeInstanceOf(Date);
    });

    it('rejette si une période est déjà ouverte (non terminée)', async () => {
      periodFindFirst.mockResolvedValue({ id: 1, endedAt: null });

      await expect(service.startNext(1, 5, 900)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(periodCreate).not.toHaveBeenCalled();
    });

    it('rejette si le match n’est plus actif (terminé/annulé/reporté)', async () => {
      matchFindFirst.mockResolvedValue({ id: 900, status: 'FINISHED' });

      await expect(service.startNext(1, 5, 900)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(periodCreate).not.toHaveBeenCalled();
    });

    it('renvoie 404 si le match n’appartient pas à l’équipe', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(service.startNext(1, 5, 900)).rejects.toBeInstanceOf(
        AppException,
      );
    });
  });

  describe('endCurrent', () => {
    it('termine la période visée et passe le match en HALFTIME', async () => {
      periodFindFirst.mockResolvedValue({ id: 1, matchId: 900, endedAt: null });

      const result = await service.endCurrent(1, 5, 900, 1);

      const [updateArgs] = periodUpdate.mock.calls[0] as [
        { where: { id: number }; data: { endedAt: Date } },
      ];
      expect(updateArgs.where).toEqual({ id: 1 });
      expect(updateArgs.data.endedAt).toBeInstanceOf(Date);
      expect(matchUpdate).toHaveBeenCalledWith({
        where: { id: 900 },
        data: { status: 'HALFTIME' },
      });
      expect(result.id).toBe(1);
      expect(result.matchId).toBe(900);
      expect(result.endedAt).toBeInstanceOf(Date);
    });

    it('renvoie 404 si la période est introuvable pour ce match', async () => {
      periodFindFirst.mockResolvedValue(null);

      await expect(service.endCurrent(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(periodUpdate).not.toHaveBeenCalled();
    });

    it('rejette une période déjà terminée', async () => {
      periodFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        endedAt: new Date(),
      });

      await expect(service.endCurrent(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(periodUpdate).not.toHaveBeenCalled();
    });

    it('rejette si le match n’est plus actif', async () => {
      matchFindFirst.mockResolvedValue({ id: 900, status: 'CANCELLED' });

      await expect(service.endCurrent(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(periodUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByMatch', () => {
    it('renvoie 404 si le match n’appartient pas à l’équipe', async () => {
      matchFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByMatch(1, 5, 900, 42),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('liste les périodes du match triées par numéro, avec canManage', async () => {
      periodFindMany.mockResolvedValue([
        { id: 1, matchId: 900, periodNumber: 1 },
      ]);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result).toEqual({
        data: [{ id: 1, matchId: 900, periodNumber: 1 }],
        canManage: true,
      });
      expect(periodFindMany).toHaveBeenCalledWith({
        where: { matchId: 900 },
        orderBy: { periodNumber: 'asc' },
      });
    });

    it('canManage=false pour un membre sans droit (ex. AdminClub, READ seul)', async () => {
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByMatch(1, 5, 900, 42);

      expect(result.canManage).toBe(false);
    });
  });
});
