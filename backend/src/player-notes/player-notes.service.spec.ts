import { HttpStatus } from '@nestjs/common';
import type { PlayerNote, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerNotesService } from './player-notes.service';

const player: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function note(overrides: Partial<PlayerNote> = {}): PlayerNote {
  return {
    id: 1,
    playerId: 100,
    authorId: 99,
    visibility: 'SEMI_PRIVE',
    title: 'Bilan technique',
    content: 'Bonne progression sur les contrôles orientés',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlayerNotesService', () => {
  let playerFindFirst: jest.Mock;
  let noteCreate: jest.Mock;
  let noteFindMany: jest.Mock;
  let noteFindFirst: jest.Mock;
  let noteUpdate: jest.Mock;
  let noteDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let service: PlayerNotesService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    noteCreate = jest.fn();
    noteFindMany = jest.fn();
    noteFindFirst = jest.fn();
    noteUpdate = jest.fn();
    noteDelete = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerNote: {
        create: noteCreate,
        findMany: noteFindMany,
        findFirst: noteFindFirst,
        update: noteUpdate,
        delete: noteDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;

    service = new PlayerNotesService(prismaStub);
  });

  describe('create', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          100,
          99,
          { visibility: 'SEMI_PRIVE', content: 'Résumé' },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(noteCreate).not.toHaveBeenCalled();
    });

    it('assigne automatiquement authorId au membre appelant (pas de sélecteur)', async () => {
      playerFindFirst.mockResolvedValue(player);
      const createdNote = note();
      noteCreate.mockResolvedValue(createdNote);

      const result = await service.create(
        1,
        100,
        99,
        {
          visibility: 'SEMI_PRIVE',
          title: 'Bilan technique',
          content: 'Bonne progression sur les contrôles orientés',
        },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result).toEqual(createdNote);
      expect(noteCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          authorId: 99,
          visibility: 'SEMI_PRIVE',
          title: 'Bilan technique',
          content: 'Bonne progression sur les contrôles orientés',
        },
        include: { author: true },
      });
    });

    it("scope TEAM : refuse si le joueur n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          100,
          43,
          { visibility: 'PRIVE', content: 'Résumé' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(noteCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('trie par date de création décroissante par défaut', async () => {
      playerFindFirst.mockResolvedValue(player);
      const existingNote = note();
      noteFindMany.mockResolvedValue([existingNote]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toEqual([existingNote]);
      expect(noteFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, createdAt: { gte: undefined, lte: undefined } },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('applique le tri transmis en query', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindMany.mockResolvedValue([note()]);

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { sortOrder: 'asc' },
      );

      expect(noteFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, createdAt: { gte: undefined, lte: undefined } },
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('applique la plage de dates transmise en query, en étendant dateTo à la fin de journée (createdAt est un horodatage complet)', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindMany.mockResolvedValue([note()]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-01-15');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 99, scope: 'CLUB' },
        { dateFrom, dateTo },
      );

      const [{ where }] = noteFindMany.mock.calls[0] as [
        { where: { createdAt: { gte: Date; lte: Date } } },
      ];
      expect(where.createdAt.gte).toBe(dateFrom);
      expect(where.createdAt.lte.getDate()).toBe(15);
      expect(where.createdAt.lte.getHours()).toBe(23);
      expect(where.createdAt.lte.getMinutes()).toBe(59);
    });

    it('scope CLUB/TEAM : renvoie aussi les notes PRIVE (staff)', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindMany.mockResolvedValue([note({ visibility: 'PRIVE' })]);

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
      expect(noteFindMany).not.toHaveBeenCalled();
    });

    it("scope OWN : refuse l'accès aux notes d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(noteFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : ne renvoie jamais les notes PRIVE, seulement SEMI_PRIVE/PUBLIC', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindMany.mockResolvedValue([
        note({ id: 1, visibility: 'PRIVE' }),
        note({ id: 2, visibility: 'SEMI_PRIVE' }),
        note({ id: 3, visibility: 'PUBLIC' }),
      ]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result.map((n) => n.id)).toEqual([2, 3]);
    });
  });

  describe('update', () => {
    it("renvoie 404 si la note n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { content: 'Nouveau contenu' },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(noteUpdate).not.toHaveBeenCalled();
    });

    it('met à jour la note trouvée', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindFirst.mockResolvedValue(note());
      noteUpdate.mockResolvedValue(note({ content: 'Nouveau contenu' }));

      const result = await service.update(
        1,
        100,
        1,
        { content: 'Nouveau contenu' },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.content).toBe('Nouveau contenu');
      expect(noteUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          visibility: undefined,
          title: undefined,
          content: 'Nouveau contenu',
        },
        include: { author: true },
      });
    });

    it("scope TEAM : refuse la modification d'une note d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          1,
          { content: 'Nouveau contenu' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(noteUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it("renvoie 404 si la note n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(noteDelete).not.toHaveBeenCalled();
    });

    it('supprime la note trouvée', async () => {
      playerFindFirst.mockResolvedValue(player);
      noteFindFirst.mockResolvedValue(note());

      await service.remove(1, 100, 1, { memberId: 99, scope: 'CLUB' });

      expect(noteDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("scope TEAM : refuse la suppression d'une note d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      playerFindFirst.mockResolvedValue(player);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, 1, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(noteDelete).not.toHaveBeenCalled();
    });
  });
});
