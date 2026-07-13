import { HttpStatus } from '@nestjs/common';
import type { Season } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonRosterImportService } from './season-roster-import.service';
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

const activeSeason: Season = { ...draftSeason, id: 99, status: 'ACTIVE' };

describe('SeasonRosterImportService', () => {
  let findOne: jest.Mock;
  let playerTeamFindMany: jest.Mock;
  let playerTeamCreateMany: jest.Mock;
  let service: SeasonRosterImportService;

  beforeEach(() => {
    findOne = jest.fn();
    playerTeamFindMany = jest.fn();
    playerTeamCreateMany = jest.fn();

    const prismaStub = {
      playerTeam: {
        findMany: playerTeamFindMany,
        createMany: playerTeamCreateMany,
      },
    } as unknown as PrismaService;

    const seasonsServiceStub = { findOne } as unknown as SeasonsService;

    service = new SeasonRosterImportService(prismaStub, seasonsServiceStub);
  });

  describe('previewRoster', () => {
    it("refuse si la saison n'est pas DRAFT", async () => {
      findOne.mockResolvedValue(activeSeason);

      await expect(service.previewRoster(1, 5, 99)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(playerTeamFindMany).not.toHaveBeenCalled();
    });

    it("retourne le roster actif actuel de l'équipe", async () => {
      findOne.mockResolvedValue(draftSeason);
      playerTeamFindMany.mockResolvedValue([
        {
          playerId: 1,
          jerseyNumber: 9,
          mainPosition: 'ST',
          player: { member: { firstName: 'Marc', lastName: 'Dupont' } },
        },
      ]);

      const result = await service.previewRoster(1, 5, 100);

      expect(result).toEqual([
        {
          playerId: 1,
          firstName: 'Marc',
          lastName: 'Dupont',
          jerseyNumber: 9,
          mainPosition: 'ST',
        },
      ]);
      expect(playerTeamFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, leaveDate: null },
        include: { player: { include: { member: true } } },
        orderBy: { player: { member: { lastName: 'asc' } } },
      });
    });
  });

  describe('importRoster', () => {
    it("refuse si la saison n'est pas DRAFT", async () => {
      findOne.mockResolvedValue(activeSeason);

      await expect(service.importRoster(1, 5, 99, [1])).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(playerTeamCreateMany).not.toHaveBeenCalled();
    });

    it('ne crée rien si aucun joueur reconduit', async () => {
      findOne.mockResolvedValue(draftSeason);

      const result = await service.importRoster(1, 5, 100, []);

      expect(result).toEqual({ importedCount: 0 });
      expect(playerTeamFindMany).not.toHaveBeenCalled();
      expect(playerTeamCreateMany).not.toHaveBeenCalled();
    });

    it('crée une nouvelle affectation par joueur reconduit, en reportant maillot/poste, sans leaveDate', async () => {
      findOne.mockResolvedValue(draftSeason);
      playerTeamFindMany.mockResolvedValue([
        {
          playerId: 1,
          jerseyNumber: 9,
          mainPosition: 'ST',
          secondaryPositions: ['CF'],
        },
        {
          playerId: 2,
          jerseyNumber: 4,
          mainPosition: 'CB',
          secondaryPositions: [],
        },
      ]);

      // playerId 3 demandé en reconduction mais absent des affectations
      // actives actuelles (déjà parti) : ignoré, pas d'erreur.
      const result = await service.importRoster(1, 5, 100, [1, 2, 3]);

      expect(playerTeamFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, leaveDate: null, playerId: { in: [1, 2, 3] } },
      });
      expect(playerTeamCreateMany).toHaveBeenCalledWith({
        data: [
          {
            playerId: 1,
            teamId: 5,
            jerseyNumber: 9,
            mainPosition: 'ST',
            secondaryPositions: ['CF'],
            joinDate: draftSeason.startDate,
          },
          {
            playerId: 2,
            teamId: 5,
            jerseyNumber: 4,
            mainPosition: 'CB',
            secondaryPositions: [],
            joinDate: draftSeason.startDate,
          },
        ],
      });
      expect(result).toEqual({ importedCount: 2 });
    });
  });
});
