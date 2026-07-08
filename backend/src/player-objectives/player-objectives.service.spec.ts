import { HttpStatus } from '@nestjs/common';
import type { PlayerObjective, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerObjectivesService } from './player-objectives.service';

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function objective(overrides: Partial<PlayerObjective> = {}): PlayerObjective {
  return {
    id: 1,
    playerId: 100,
    assignedById: 99,
    theme: 'TECHNIQUE',
    description: 'Améliorer les contrôles orientés',
    horizon: 'MID_TERM',
    status: 'PLANNED',
    visibility: 'SEMI_PRIVE',
    startDate: null,
    dueDate: null,
    completedDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlayerObjectivesService', () => {
  let playerFindFirst: jest.Mock;
  let objectiveCreate: jest.Mock;
  let objectiveFindMany: jest.Mock;
  let objectiveFindFirst: jest.Mock;
  let objectiveUpdate: jest.Mock;
  let objectiveDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let service: PlayerObjectivesService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    objectiveCreate = jest.fn();
    objectiveFindMany = jest.fn();
    objectiveFindFirst = jest.fn();
    objectiveUpdate = jest.fn();
    objectiveDelete = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerObjective: {
        create: objectiveCreate,
        findMany: objectiveFindMany,
        findFirst: objectiveFindFirst,
        update: objectiveUpdate,
        delete: objectiveDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;

    service = new PlayerObjectivesService(prismaStub);
  });

  describe('create', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          100,
          99,
          {
            theme: 'TECHNIQUE',
            description: 'Résumé',
            horizon: 'SHORT_TERM',
          },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(objectiveCreate).not.toHaveBeenCalled();
    });

    it('assigne automatiquement assignedById au membre appelant (pas de sélecteur)', async () => {
      playerFindFirst.mockResolvedValue(player);
      const createdObjective = objective();
      objectiveCreate.mockResolvedValue(createdObjective);

      const result = await service.create(
        1,
        100,
        99,
        {
          theme: 'TECHNIQUE',
          description: 'Améliorer les contrôles orientés',
          horizon: 'MID_TERM',
        },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result).toEqual(createdObjective);
      expect(objectiveCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          assignedById: 99,
          theme: 'TECHNIQUE',
          description: 'Améliorer les contrôles orientés',
          horizon: 'MID_TERM',
          status: undefined,
          visibility: undefined,
          startDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
        },
        include: { assignedBy: true },
      });
    });

    it("scope TEAM : refuse si le joueur n'appartient pas à cette équipe (faille A7.3, appliquée dès la conception ici)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          100,
          43,
          { theme: 'MENTAL', description: 'Résumé', horizon: 'LONG_TERM' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(objectiveCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('trie par date de début décroissante par défaut (nulls en dernier), sans filtre', async () => {
      playerFindFirst.mockResolvedValue(player);
      const existingObjective = objective();
      objectiveFindMany.mockResolvedValue([existingObjective]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toEqual([existingObjective]);
      expect(objectiveFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          status: undefined,
          theme: undefined,
          startDate: { gte: undefined, lte: undefined },
        },
        include: { assignedBy: true },
        orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
      });
    });

    it('applique le filtre de statut, le filtre de thème et le tri transmis en query', async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindMany.mockResolvedValue([
        objective({ status: 'IN_PROGRESS', theme: 'PHYSIQUE' }),
      ]);

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { status: 'IN_PROGRESS', theme: 'PHYSIQUE', sortOrder: 'asc' },
      );

      expect(objectiveFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          status: 'IN_PROGRESS',
          theme: 'PHYSIQUE',
          startDate: { gte: undefined, lte: undefined },
        },
        include: { assignedBy: true },
        orderBy: { startDate: { sort: 'asc', nulls: 'last' } },
      });
    });

    it('applique la plage de dates transmise en query (borne startDate, même champ que le tri)', async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindMany.mockResolvedValue([objective()]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-06-30');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { dateFrom, dateTo },
      );

      expect(objectiveFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          status: undefined,
          theme: undefined,
          startDate: { gte: dateFrom, lte: dateTo },
        },
        include: { assignedBy: true },
        orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
      });
    });

    it('scope CLUB/TEAM : renvoie aussi les objectifs PRIVE (staff)', async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindMany.mockResolvedValue([objective({ visibility: 'PRIVE' })]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toHaveLength(1);
    });

    it("scope TEAM : refuse la lecture d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, {
          memberId: 43,
          scope: 'TEAM',
          teamId: 8,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(objectiveFindMany).not.toHaveBeenCalled();
    });

    it("scope OWN : refuse l'accès aux objectifs d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(objectiveFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : ne renvoie jamais les objectifs PRIVE, seulement SEMI_PRIVE/PUBLIC', async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindMany.mockResolvedValue([
        objective({ id: 1, visibility: 'PRIVE' }),
        objective({ id: 2, visibility: 'SEMI_PRIVE' }),
        objective({ id: 3, visibility: 'PUBLIC' }),
      ]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result.map((o) => o.id)).toEqual([2, 3]);
    });
  });

  describe('update', () => {
    it("renvoie 404 si l'objectif n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { status: 'ACHIEVED' },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(objectiveUpdate).not.toHaveBeenCalled();
    });

    it("met à jour le statut de l'objectif trouvé", async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindFirst.mockResolvedValue(objective());
      objectiveUpdate.mockResolvedValue(objective({ status: 'ACHIEVED' }));

      const result = await service.update(
        1,
        100,
        1,
        { status: 'ACHIEVED' },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.status).toBe('ACHIEVED');
      expect(objectiveUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          theme: undefined,
          description: undefined,
          horizon: undefined,
          status: 'ACHIEVED',
          visibility: undefined,
          startDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
        },
        include: { assignedBy: true },
      });
    });

    it("scope TEAM : refuse la modification d'un objectif d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { status: 'ACHIEVED' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(objectiveUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it("renvoie 404 si l'objectif n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(objectiveDelete).not.toHaveBeenCalled();
    });

    it("supprime l'objectif trouvé", async () => {
      playerFindFirst.mockResolvedValue(player);
      objectiveFindFirst.mockResolvedValue(objective());

      await service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' });

      expect(objectiveDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("scope TEAM : refuse la suppression d'un objectif d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(objectiveDelete).not.toHaveBeenCalled();
    });
  });
});
