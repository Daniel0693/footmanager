import { HttpStatus } from '@nestjs/common';
import type { PlayerAbsence, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerAbsencesService } from './player-absences.service';

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function absence(overrides: Partial<PlayerAbsence> = {}): PlayerAbsence {
  return {
    id: 1,
    playerId: 100,
    reportedById: 99,
    reason: 'INJURY',
    description: 'Douleur au genou droit',
    startDate: new Date('2026-07-10'),
    endDate: new Date('2026-07-20'),
    isExcused: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlayerAbsencesService', () => {
  let playerFindFirst: jest.Mock;
  let absenceCreate: jest.Mock;
  let absenceFindMany: jest.Mock;
  let absenceFindFirst: jest.Mock;
  let absenceUpdate: jest.Mock;
  let absenceDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let service: PlayerAbsencesService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    absenceCreate = jest.fn();
    absenceFindMany = jest.fn();
    absenceFindFirst = jest.fn();
    absenceUpdate = jest.fn();
    absenceDelete = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerAbsence: {
        create: absenceCreate,
        findMany: absenceFindMany,
        findFirst: absenceFindFirst,
        update: absenceUpdate,
        delete: absenceDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;

    service = new PlayerAbsencesService(prismaStub);
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
            reason: 'INJURY',
            startDate: new Date('2026-07-10'),
            endDate: new Date('2026-07-20'),
          },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(absenceCreate).not.toHaveBeenCalled();
    });

    it('assigne automatiquement reportedById au membre appelant (pas de sélecteur)', async () => {
      playerFindFirst.mockResolvedValue(player);
      const createdAbsence = absence();
      absenceCreate.mockResolvedValue(createdAbsence);

      const result = await service.create(
        1,
        100,
        99,
        {
          reason: 'INJURY',
          description: 'Douleur au genou droit',
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-20'),
        },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result).toEqual(createdAbsence);
      expect(absenceCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          reportedById: 99,
          reason: 'INJURY',
          description: 'Douleur au genou droit',
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-20'),
          isExcused: undefined,
        },
        include: { reportedBy: true },
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
          {
            reason: 'INJURY',
            startDate: new Date('2026-07-10'),
            endDate: new Date('2026-07-20'),
          },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(absenceCreate).not.toHaveBeenCalled();
    });

    it('scope OWN : un joueur peut déclarer sa propre absence, isExcused forcé à null même si transmis', async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceCreate.mockResolvedValue(absence());

      await service.create(
        1,
        100,
        42,
        {
          reason: 'VACATION',
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-20'),
          isExcused: true,
        },
        { memberId: 42, scope: 'OWN' },
      );

      expect(absenceCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          reportedById: 42,
          reason: 'VACATION',
          description: undefined,
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-20'),
          isExcused: null,
        },
        include: { reportedBy: true },
      });
    });

    it('scope OWN : refuse de déclarer une absence pour un autre joueur', async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.create(
          1,
          100,
          999,
          {
            reason: 'INJURY',
            startDate: new Date('2026-07-10'),
            endDate: new Date('2026-07-20'),
          },
          { memberId: 999, scope: 'OWN' },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(absenceCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('trie par date de début décroissante par défaut, sans filtre', async () => {
      playerFindFirst.mockResolvedValue(player);
      const existingAbsence = absence();
      absenceFindMany.mockResolvedValue([existingAbsence]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toEqual([existingAbsence]);
      expect(absenceFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          startDate: { gte: undefined, lte: undefined },
        },
        include: { reportedBy: true },
        orderBy: { startDate: 'desc' },
      });
    });

    it('applique le tri transmis en query', async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindMany.mockResolvedValue([absence()]);

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { sortOrder: 'asc' },
      );

      expect(absenceFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          startDate: { gte: undefined, lte: undefined },
        },
        include: { reportedBy: true },
        orderBy: { startDate: 'asc' },
      });
    });

    it('applique la plage de dates transmise en query (borne startDate, même champ que le tri)', async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindMany.mockResolvedValue([absence()]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-06-30');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { dateFrom, dateTo },
      );

      expect(absenceFindMany).toHaveBeenCalledWith({
        where: {
          playerId: 100,
          startDate: { gte: dateFrom, lte: dateTo },
        },
        include: { reportedBy: true },
        orderBy: { startDate: 'desc' },
      });
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
      expect(absenceFindMany).not.toHaveBeenCalled();
    });

    it("scope OWN : refuse l'accès aux absences d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(absenceFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : consulte ses propres absences (pas de modèle de visibilité, contrairement à PlayerObjective)', async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindMany.mockResolvedValue([absence()]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it("renvoie 404 si l'absence n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { isExcused: true },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(absenceUpdate).not.toHaveBeenCalled();
    });

    it("met à jour le statut d'excuse de l'absence trouvée", async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindFirst.mockResolvedValue(absence());
      absenceUpdate.mockResolvedValue(absence({ isExcused: true }));

      const result = await service.update(
        1,
        100,
        1,
        { isExcused: true },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.isExcused).toBe(true);
      expect(absenceUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          reason: undefined,
          description: undefined,
          startDate: undefined,
          endDate: undefined,
          isExcused: true,
        },
        include: { reportedBy: true },
      });
    });

    it("scope TEAM : refuse la modification d'une absence d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { isExcused: true },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(absenceUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it("renvoie 404 si l'absence n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(absenceDelete).not.toHaveBeenCalled();
    });

    it("supprime l'absence trouvée", async () => {
      playerFindFirst.mockResolvedValue(player);
      absenceFindFirst.mockResolvedValue(absence());

      await service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' });

      expect(absenceDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("scope TEAM : refuse la suppression d'une absence d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(absenceDelete).not.toHaveBeenCalled();
    });
  });
});
