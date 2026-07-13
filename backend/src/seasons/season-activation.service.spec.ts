import { HttpStatus } from '@nestjs/common';
import type { Season } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonActivationService } from './season-activation.service';
import { SeasonsService } from './seasons.service';

const draftSeason: Season = {
  id: 100,
  teamId: 5,
  name: 'Saison 2026-2027',
  teamNameSnapshot: null,
  categorySnapshot: null,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2027-06-30'),
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeOldSeason: Season = {
  ...draftSeason,
  id: 99,
  name: 'Saison 2025-2026',
  startDate: new Date('2025-08-01'),
  endDate: new Date('2026-06-30'),
  status: 'ACTIVE',
};

function buildAssignment(
  playerId: number,
  joinDate: Date | null,
  firstName: string,
  lastName: string,
) {
  return {
    playerId,
    joinDate,
    player: { member: { firstName, lastName } },
  };
}

describe('SeasonActivationService', () => {
  let findOne: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let seasonCount: jest.Mock;
  let seasonFindUniqueOrThrow: jest.Mock;
  let playerTeamFindMany: jest.Mock;
  let txSeasonUpdate: jest.Mock;
  let txPlayerTeamUpdateMany: jest.Mock;
  let transaction: jest.Mock;
  let service: SeasonActivationService;

  beforeEach(() => {
    findOne = jest.fn();
    seasonFindFirst = jest.fn();
    seasonCount = jest.fn().mockResolvedValue(1);
    seasonFindUniqueOrThrow = jest.fn();
    playerTeamFindMany = jest.fn().mockResolvedValue([]);
    txSeasonUpdate = jest.fn();
    txPlayerTeamUpdateMany = jest.fn();
    transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        season: { update: txSeasonUpdate },
        playerTeam: { updateMany: txPlayerTeamUpdateMany },
      }),
    );

    const prismaStub = {
      season: {
        findFirst: seasonFindFirst,
        count: seasonCount,
        findUniqueOrThrow: seasonFindUniqueOrThrow,
      },
      playerTeam: { findMany: playerTeamFindMany },
      $transaction: transaction,
    } as unknown as PrismaService;

    const seasonsServiceStub = { findOne } as unknown as SeasonsService;

    service = new SeasonActivationService(prismaStub, seasonsServiceStub);
  });

  describe('getActivationSummary', () => {
    it("refuse si la saison n'est pas DRAFT", async () => {
      findOne.mockResolvedValue(activeOldSeason);

      await expect(
        service.getActivationSummary(1, 5, activeOldSeason.id),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it("renvoie oldSeasonEndDate null s'il n'y a pas d'ancienne saison ACTIVE", async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(null);

      const result = await service.getActivationSummary(1, 5, 100);

      expect(result.oldSeasonEndDate).toBeNull();
    });

    it('regroupe reconduits/partants/arrivants selon le joinDate par rapport au début de la nouvelle saison', async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(activeOldSeason);
      playerTeamFindMany.mockResolvedValue([
        // Joueur 1 : reconduit — une affectation avant et une à partir du
        // startDate de la nouvelle saison (import du roster, A6).
        buildAssignment(1, new Date('2025-08-01'), 'Marc', 'Dupont'),
        buildAssignment(1, new Date('2026-08-01'), 'Marc', 'Dupont'),
        // Joueur 2 : partant — uniquement l'ancienne affectation.
        buildAssignment(2, new Date('2025-08-01'), 'Alice', 'Martin'),
        // Joueur 3 : arrivant — affectation ajoutée pendant la fenêtre DRAFT.
        buildAssignment(3, new Date('2026-08-15'), 'Paul', 'Durand'),
        // Joueur 4 : joinDate null — traité comme arrivant, jamais fermé.
        buildAssignment(4, null, 'Eve', 'Bernard'),
      ]);

      const result = await service.getActivationSummary(1, 5, 100);

      expect(result.retained).toEqual([
        { playerId: 1, firstName: 'Marc', lastName: 'Dupont' },
      ]);
      expect(result.departing).toEqual([
        { playerId: 2, firstName: 'Alice', lastName: 'Martin' },
      ]);
      expect(result.arriving).toEqual([
        { playerId: 3, firstName: 'Paul', lastName: 'Durand' },
        { playerId: 4, firstName: 'Eve', lastName: 'Bernard' },
      ]);
      expect(result.oldSeasonEndDate).toEqual(activeOldSeason.endDate);
    });
  });

  describe('activate', () => {
    it("refuse si la saison n'est pas DRAFT", async () => {
      findOne.mockResolvedValue(activeOldSeason);

      await expect(
        service.activate(1, 5, activeOldSeason.id),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(transaction).not.toHaveBeenCalled();
    });

    it("archive l'ancienne saison, ferme les affectations antérieures, active la nouvelle", async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(activeOldSeason);
      seasonFindUniqueOrThrow.mockResolvedValue({
        ...draftSeason,
        status: 'ACTIVE',
      });

      const result = await service.activate(1, 5, 100);

      expect(txSeasonUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: activeOldSeason.id },
        data: { status: 'ARCHIVED', endDate: activeOldSeason.endDate },
      });
      expect(txPlayerTeamUpdateMany).toHaveBeenCalledWith({
        where: {
          teamId: 5,
          leaveDate: null,
          joinDate: { lt: draftSeason.startDate },
        },
        data: { leaveDate: activeOldSeason.endDate },
      });
      expect(txSeasonUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: draftSeason.id },
        data: { status: 'ACTIVE' },
      });
      expect(result.status).toBe('ACTIVE');
    });

    it("utilise oldSeasonEndDate transmis plutôt que l'endDate déjà enregistrée", async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(activeOldSeason);
      seasonFindUniqueOrThrow.mockResolvedValue(draftSeason);
      const correctedEndDate = new Date('2026-07-15');

      await service.activate(1, 5, 100, correctedEndDate);

      expect(txSeasonUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: activeOldSeason.id },
        data: { status: 'ARCHIVED', endDate: correctedEndDate },
      });
      expect(txPlayerTeamUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { leaveDate: correctedEndDate } }),
      );
    });

    it("saute l'archivage s'il n'y a pas d'ancienne saison ACTIVE (première saison de l'équipe)", async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(null);
      seasonFindUniqueOrThrow.mockResolvedValue({
        ...draftSeason,
        status: 'ACTIVE',
      });

      await service.activate(1, 5, 100);

      expect(txPlayerTeamUpdateMany).not.toHaveBeenCalled();
      expect(txSeasonUpdate).toHaveBeenCalledTimes(1);
      expect(txSeasonUpdate).toHaveBeenCalledWith({
        where: { id: draftSeason.id },
        data: { status: 'ACTIVE' },
      });
    });

    it("refuse (assertion défensive) si plus d'une saison ACTIVE subsiste après l'opération", async () => {
      findOne.mockResolvedValue(draftSeason);
      seasonFindFirst.mockResolvedValue(activeOldSeason);
      seasonCount.mockResolvedValue(2);

      await expect(service.activate(1, 5, 100)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(seasonFindUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
