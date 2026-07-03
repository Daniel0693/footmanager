import { HttpStatus } from '@nestjs/common';
import type { PlayerProfile, PlayerTeam, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerTeamsService } from './player-teams.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const assignment: PlayerTeam = {
  id: 200,
  playerId: 100,
  teamId: 5,
  jerseyNumber: 9,
  mainPosition: 'ST',
  secondaryPosition: null,
  joinDate: null,
  leaveDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayerTeamsService', () => {
  let teamFindFirst: jest.Mock;
  let playerFindFirst: jest.Mock;
  let ptFindFirst: jest.Mock;
  let ptFindMany: jest.Mock;
  let ptCreate: jest.Mock;
  let ptUpdate: jest.Mock;
  let ptDelete: jest.Mock;
  let service: PlayerTeamsService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    playerFindFirst = jest.fn();
    ptFindFirst = jest.fn();
    ptFindMany = jest.fn();
    ptCreate = jest.fn();
    ptUpdate = jest.fn();
    ptDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerProfile: { findFirst: playerFindFirst },
      playerTeam: {
        findFirst: ptFindFirst,
        findMany: ptFindMany,
        create: ptCreate,
        update: ptUpdate,
        delete: ptDelete,
      },
    } as unknown as PrismaService;

    service = new PlayerTeamsService(prismaStub);
  });

  describe('create', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, { playerId: 100 }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(ptCreate).not.toHaveBeenCalled();
    });

    it("refuse si le joueur n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(team);
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, { playerId: 100 }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(ptCreate).not.toHaveBeenCalled();
    });

    it('refuse si le joueur a déjà une affectation active dans cette équipe', async () => {
      teamFindFirst.mockResolvedValue(team);
      playerFindFirst.mockResolvedValue(player);
      ptFindFirst.mockResolvedValueOnce(assignment); // affectation active existante

      await expect(
        service.create(1, 5, { playerId: 100 }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(ptCreate).not.toHaveBeenCalled();
    });

    it('refuse si le numéro de maillot est déjà pris par une affectation active', async () => {
      teamFindFirst.mockResolvedValue(team);
      playerFindFirst.mockResolvedValue(player);
      ptFindFirst
        .mockResolvedValueOnce(null) // pas d'affectation active pour ce joueur
        .mockResolvedValueOnce(assignment); // numéro 9 déjà pris

      await expect(
        service.create(1, 5, { playerId: 100, jerseyNumber: 9 }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(ptCreate).not.toHaveBeenCalled();
    });

    it('crée l’affectation quand toutes les vérifications passent', async () => {
      teamFindFirst.mockResolvedValue(team);
      playerFindFirst.mockResolvedValue(player);
      ptFindFirst.mockResolvedValue(null);
      ptCreate.mockResolvedValue(assignment);

      const result = await service.create(1, 5, {
        playerId: 100,
        jerseyNumber: 9,
        mainPosition: 'ST',
      });

      expect(result).toBe(assignment);
      expect(ptCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          teamId: 5,
          jerseyNumber: 9,
          mainPosition: 'ST',
          secondaryPosition: undefined,
          joinDate: undefined,
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
    });

    it('ne renvoie que les affectations actives (leaveDate null)', async () => {
      teamFindFirst.mockResolvedValue(team);
      ptFindMany.mockResolvedValue([assignment]);

      const result = await service.findAllByTeam(1, 5);

      expect(result).toEqual([assignment]);
      expect(ptFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, leaveDate: null },
        include: { player: { include: { member: true } } },
        orderBy: { jerseyNumber: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si l’affectation est introuvable dans cette équipe/club', async () => {
      ptFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 200, { jerseyNumber: 10 }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(ptUpdate).not.toHaveBeenCalled();
    });

    it('ne revérifie pas le numéro si inchangé', async () => {
      ptFindFirst.mockResolvedValue(assignment); // jerseyNumber déjà 9
      ptUpdate.mockResolvedValue({ ...assignment, mainPosition: 'CB' });

      await service.update(1, 5, 200, { jerseyNumber: 9, mainPosition: 'CB' });

      // Un seul appel findFirst (résolution de l'affectation), pas de
      // second appel pour vérifier la disponibilité du numéro.
      expect(ptFindFirst).toHaveBeenCalledTimes(1);
    });

    it('refuse si le nouveau numéro est déjà pris par une autre affectation active', async () => {
      ptFindFirst
        .mockResolvedValueOnce(assignment) // résolution de l'affectation ciblée
        .mockResolvedValueOnce({ ...assignment, id: 999 }); // conflit

      await expect(
        service.update(1, 5, 200, { jerseyNumber: 11 }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(ptUpdate).not.toHaveBeenCalled();
    });

    it('met à jour et exclut sa propre ligne du contrôle de numéro', async () => {
      ptFindFirst.mockResolvedValueOnce(assignment).mockResolvedValueOnce(null); // aucun conflit une fois exclu
      ptUpdate.mockResolvedValue({ ...assignment, jerseyNumber: 11 });

      await service.update(1, 5, 200, { jerseyNumber: 11 });

      expect(ptFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          teamId: 5,
          jerseyNumber: 11,
          leaveDate: null,
          id: { not: 200 },
        },
      });
    });

    it('permet de clôturer une affectation via leaveDate (historisation)', async () => {
      ptFindFirst.mockResolvedValue(assignment);
      const leaveDate = new Date('2026-06-30');
      ptUpdate.mockResolvedValue({ ...assignment, leaveDate });

      await service.update(1, 5, 200, { leaveDate });

      expect(ptUpdate).toHaveBeenCalledWith({
        where: { id: 200 },
        data: {
          jerseyNumber: undefined,
          mainPosition: undefined,
          secondaryPosition: undefined,
          joinDate: undefined,
          leaveDate,
        },
      });
    });
  });

  describe('remove', () => {
    it('renvoie 404 si l’affectation est introuvable dans cette équipe/club', async () => {
      ptFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 200)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(ptDelete).not.toHaveBeenCalled();
    });

    it('supprime l’affectation trouvée', async () => {
      ptFindFirst.mockResolvedValue(assignment);

      await service.remove(1, 5, 200);

      expect(ptDelete).toHaveBeenCalledWith({ where: { id: 200 } });
    });
  });
});
