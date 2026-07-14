import { HttpStatus } from '@nestjs/common';
import type { PlayerEvaluation, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerEvaluationsService } from './player-evaluations.service';

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const evaluationDate = new Date('2026-06-01');

function evaluation(
  overrides: Partial<PlayerEvaluation> = {},
): PlayerEvaluation {
  return {
    id: 1,
    playerId: 100,
    date: evaluationDate,
    evaluatorId: 99,
    teamId: null,
    comments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlayerEvaluationsService', () => {
  let playerFindFirst: jest.Mock;
  let criterionCount: jest.Mock;
  let evaluationCreate: jest.Mock;
  let evaluationFindMany: jest.Mock;
  let evaluationFindFirst: jest.Mock;
  let evaluationUpdate: jest.Mock;
  let evaluationDelete: jest.Mock;
  let scoreDeleteMany: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let seasonFindFirst: jest.Mock;
  let service: PlayerEvaluationsService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    criterionCount = jest.fn().mockResolvedValue(2);
    evaluationCreate = jest.fn();
    evaluationFindMany = jest.fn();
    evaluationFindFirst = jest.fn();
    evaluationUpdate = jest.fn();
    evaluationDelete = jest.fn();
    scoreDeleteMany = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    seasonFindFirst = jest.fn();

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      evaluationCriterion: { count: criterionCount },
      playerEvaluation: {
        create: evaluationCreate,
        findMany: evaluationFindMany,
        findFirst: evaluationFindFirst,
        update: evaluationUpdate,
        delete: evaluationDelete,
      },
      playerEvaluationScore: { deleteMany: scoreDeleteMany },
      playerTeam: { findFirst: playerTeamFindFirst },
      season: { findFirst: seasonFindFirst },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prismaStub),
      ),
    } as unknown as PrismaService;

    service = new PlayerEvaluationsService(prismaStub);
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
            date: evaluationDate,
            scores: [{ criterionId: 5, score: 8 }],
          },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(evaluationCreate).not.toHaveBeenCalled();
    });

    it("refuse si un des critères n'appartient pas au club (custom d'un autre club)", async () => {
      playerFindFirst.mockResolvedValue(player);
      criterionCount.mockResolvedValue(1);

      await expect(
        service.create(
          1,
          100,
          99,
          {
            date: evaluationDate,
            scores: [
              { criterionId: 5, score: 8 },
              { criterionId: 999, score: 6 },
            ],
          },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(evaluationCreate).not.toHaveBeenCalled();
    });

    it('note tous les critères transmis en une session et assigne automatiquement evaluatorId (pas de sélecteur)', async () => {
      playerFindFirst.mockResolvedValue(player);
      criterionCount.mockResolvedValue(3);
      const createdEvaluation = evaluation();
      evaluationCreate.mockResolvedValue(createdEvaluation);

      const result = await service.create(
        1,
        100,
        99,
        {
          date: evaluationDate,
          comments: 'Bonne séance',
          scores: [
            { criterionId: 1, score: 7.5 },
            { criterionId: 2, score: 6 },
            { criterionId: 10, score: 8 },
          ],
        },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result).toEqual(createdEvaluation);
      expect(criterionCount).toHaveBeenCalledWith({
        where: {
          id: { in: [1, 2, 10] },
          OR: [{ clubId: null }, { clubId: 1 }],
        },
      });
      expect(evaluationCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          evaluatorId: 99,
          date: evaluationDate,
          comments: 'Bonne séance',
          scores: {
            create: [
              { criterionId: 1, score: 7.5 },
              { criterionId: 2, score: 6 },
              { criterionId: 10, score: 8 },
            ],
          },
        },
        include: {
          scores: { include: { criterion: { include: { category: true } } } },
          evaluator: true,
        },
      });
    });

    it("scope TEAM : refuse si le joueur n'appartient pas à cette équipe", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          100,
          43,
          { date: evaluationDate, scores: [{ criterionId: 5, score: 6 }] },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(evaluationCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('trie par date décroissante par défaut, sans filtre', async () => {
      playerFindFirst.mockResolvedValue(player);
      const existingEvaluation = evaluation();
      evaluationFindMany.mockResolvedValue([existingEvaluation]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toEqual([existingEvaluation]);
      expect(evaluationFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          date: { gte: undefined, lte: undefined },
        },
        include: {
          scores: { include: { criterion: { include: { category: true } } } },
          evaluator: true,
        },
        orderBy: { date: 'desc' },
      });
    });

    it('applique la plage de dates et le tri transmis en query', async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindMany.mockResolvedValue([evaluation()]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-06-30');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { dateFrom, dateTo, sortOrder: 'asc' },
      );

      expect(evaluationFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          date: { gte: dateFrom, lte: dateTo },
        },
        include: {
          scores: { include: { criterion: { include: { category: true } } } },
          evaluator: true,
        },
        orderBy: { date: 'asc' },
      });
    });

    it("scope TEAM : refuse la lecture d'un joueur qui n'appartient pas à cette équipe", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, {
          memberId: 43,
          scope: 'TEAM',
          teamId: 8,
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(evaluationFindMany).not.toHaveBeenCalled();
    });

    it("scope OWN : refuse l'accès aux évaluations d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(evaluationFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : consulte ses propres évaluations', async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindMany.mockResolvedValue([evaluation()]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result).toHaveLength(1);
    });

    describe('filtrage rétroactif par saison (A12)', () => {
      it('borne date aux dates de la saison, prioritaire sur dateFrom/dateTo', async () => {
        playerFindFirst.mockResolvedValue(player);
        evaluationFindMany.mockResolvedValue([evaluation()]);
        const startDate = new Date('2026-08-01');
        const endDate = new Date('2027-06-30');
        seasonFindFirst.mockResolvedValue({
          id: 10,
          clubId: 1,
          startDate,
          endDate,
        });

        await service.findAllByPlayer(
          1,
          100,
          { memberId: 99, scope: 'TEAM', teamId: 8 },
          {
            seasonId: 10,
            dateFrom: new Date('2000-01-01'),
            dateTo: new Date('2000-12-31'),
          },
        );

        expect(seasonFindFirst).toHaveBeenCalledWith({
          where: { id: 10, clubId: 1 },
        });
        expect(evaluationFindMany).toHaveBeenCalledWith({
          where: {
            playerId: 100,
            date: { gte: startDate, lte: endDate },
          },
          include: {
            scores: { include: { criterion: { include: { category: true } } } },
            evaluator: true,
          },
          orderBy: { date: 'desc' },
        });
      });

      it('renvoie 404 si la saison ne correspond pas au club transmis', async () => {
        playerFindFirst.mockResolvedValue(player);
        seasonFindFirst.mockResolvedValue(null);

        await expect(
          service.findAllByPlayer(
            1,
            100,
            { memberId: 99, scope: 'TEAM', teamId: 8 },
            { seasonId: 999 },
          ),
        ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
        expect(evaluationFindMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('update', () => {
    it("renvoie 404 si l'évaluation n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { comments: 'Modifié' },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(evaluationUpdate).not.toHaveBeenCalled();
    });

    it("refuse si un des nouveaux critères n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(evaluation());
      criterionCount.mockResolvedValue(0);

      await expect(
        service.update(
          1,
          100,
          1,
          { scores: [{ criterionId: 999, score: 5 }] },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(evaluationUpdate).not.toHaveBeenCalled();
      expect(scoreDeleteMany).not.toHaveBeenCalled();
    });

    it("met à jour la date/le commentaire sans toucher aux scores si `scores` n'est pas fourni", async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(evaluation());
      evaluationUpdate.mockResolvedValue(
        evaluation({ comments: 'Mis à jour' }),
      );

      const result = await service.update(
        1,
        100,
        1,
        { comments: 'Mis à jour' },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.comments).toBe('Mis à jour');
      expect(scoreDeleteMany).not.toHaveBeenCalled();
      expect(evaluationUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { date: undefined, comments: 'Mis à jour' },
        include: {
          scores: { include: { criterion: { include: { category: true } } } },
          evaluator: true,
        },
      });
    });

    it('remplace intégralement les scores de la session quand `scores` est fourni', async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(evaluation());
      criterionCount.mockResolvedValue(2);
      evaluationUpdate.mockResolvedValue(evaluation());

      await service.update(
        1,
        100,
        1,
        {
          scores: [
            { criterionId: 1, score: 9 },
            { criterionId: 2, score: 8.5 },
          ],
        },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(scoreDeleteMany).toHaveBeenCalledWith({
        where: { evaluationId: 1 },
      });
      expect(evaluationUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          date: undefined,
          comments: undefined,
          scores: {
            create: [
              { criterionId: 1, score: 9 },
              { criterionId: 2, score: 8.5 },
            ],
          },
        },
        include: {
          scores: { include: { criterion: { include: { category: true } } } },
          evaluator: true,
        },
      });
    });

    it("scope TEAM : refuse la modification d'une évaluation d'un joueur qui n'appartient pas à cette équipe", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { comments: 'Modifié' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(evaluationUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it("renvoie 404 si l'évaluation n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(evaluationDelete).not.toHaveBeenCalled();
    });

    it('supprime la session (les scores sont supprimés en cascade par la base, pas par le service)', async () => {
      playerFindFirst.mockResolvedValue(player);
      evaluationFindFirst.mockResolvedValue(evaluation());

      await service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' });

      expect(evaluationDelete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(scoreDeleteMany).not.toHaveBeenCalled();
    });

    it("scope TEAM : refuse la suppression d'une évaluation d'un joueur qui n'appartient pas à cette équipe", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(evaluationDelete).not.toHaveBeenCalled();
    });
  });
});
