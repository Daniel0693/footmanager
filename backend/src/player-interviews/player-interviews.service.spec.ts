import { HttpStatus } from '@nestjs/common';
import type { Member, PlayerInterview, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerInterviewsService } from './player-interviews.service';

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

const staffMember: Member = {
  id: 99,
  userId: 70,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Admin',
  phone: null,
  avatarUrl: null,
  gender: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const interview: PlayerInterview = {
  id: 1,
  playerId: 100,
  staffId: 99,
  date: new Date('2026-01-15'),
  subject: 'Bilan mi-saison',
  summary: 'Bonne progression technique',
  staffFeedback: 'Continuer sur cette lancée',
  staffAssessment: 'Joueur en confiance, à responsabiliser',
  playerFeedback: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayerInterviewsService', () => {
  let playerFindFirst: jest.Mock;
  let interviewCreate: jest.Mock;
  let interviewFindMany: jest.Mock;
  let interviewFindFirst: jest.Mock;
  let interviewUpdate: jest.Mock;
  let interviewDelete: jest.Mock;
  let service: PlayerInterviewsService;

  beforeEach(() => {
    playerFindFirst = jest.fn();
    interviewCreate = jest.fn();
    interviewFindMany = jest.fn();
    interviewFindFirst = jest.fn();
    interviewUpdate = jest.fn();
    interviewDelete = jest.fn();

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      playerInterview: {
        create: interviewCreate,
        findMany: interviewFindMany,
        findFirst: interviewFindFirst,
        update: interviewUpdate,
        delete: interviewDelete,
      },
    } as unknown as PrismaService;

    service = new PlayerInterviewsService(prismaStub);
  });

  describe('create', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 100, staffMember.id, {
          date: new Date('2026-01-15'),
          subject: 'Bilan',
          summary: 'Résumé',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(interviewCreate).not.toHaveBeenCalled();
    });

    it('assigne automatiquement staffId au membre appelant (pas de sélecteur)', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewCreate.mockResolvedValue(interview);
      const date = new Date('2026-01-15');

      const result = await service.create(1, 100, 99, {
        date,
        subject: 'Bilan mi-saison',
        summary: 'Bonne progression technique',
        staffFeedback: 'Continuer sur cette lancée',
        staffAssessment: 'Joueur en confiance, à responsabiliser',
      });

      expect(result).toBe(interview);
      expect(interviewCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          staffId: 99,
          date,
          subject: 'Bilan mi-saison',
          summary: 'Bonne progression technique',
          staffFeedback: 'Continuer sur cette lancée',
          staffAssessment: 'Joueur en confiance, à responsabiliser',
          playerFeedback: undefined,
        },
        include: { staff: true },
      });
    });

    it('permet de planifier un entretien sans staffFeedback/staffAssessment/playerFeedback (à compléter plus tard)', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewCreate.mockResolvedValue(interview);
      const date = new Date('2026-12-01');

      await service.create(1, 100, 99, {
        date,
        subject: 'Bilan de fin de saison (planifié)',
        summary: 'Points à aborder : temps de jeu, objectifs été',
      });

      expect(interviewCreate).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          staffId: 99,
          date,
          subject: 'Bilan de fin de saison (planifié)',
          summary: 'Points à aborder : temps de jeu, objectifs été',
          staffFeedback: undefined,
          staffAssessment: undefined,
          playerFeedback: undefined,
        },
        include: { staff: true },
      });
    });
  });

  describe('findAllByPlayer', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 42, scope: 'CLUB' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('trie par date décroissante par défaut', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([interview]);

      const result = await service.findAllByPlayer(1, 100, {
        memberId: 999,
        scope: 'CLUB',
      });

      expect(result).toEqual([interview]);
      expect(interviewFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, date: { gte: undefined, lte: undefined } },
        include: { staff: true },
        orderBy: { date: 'desc' },
      });
    });

    it('applique la plage de dates et le tri transmis en query (scope CLUB : aucune borne future imposée)', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([interview]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2099-06-30');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 999, scope: 'CLUB' },
        { dateFrom, dateTo, sortOrder: 'asc' },
      );

      expect(interviewFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, date: { gte: dateFrom, lte: dateTo } },
        include: { staff: true },
        orderBy: { date: 'asc' },
      });
    });

    it('scope TEAM (Coach) : voit aussi les entretiens à venir, staffAssessment non filtré', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([interview]);
      const farFuture = new Date('2099-01-01');

      const result = await service.findAllByPlayer(
        1,
        100,
        { memberId: 999, scope: 'TEAM' },
        { dateTo: farFuture },
      );

      expect(interviewFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, date: { gte: undefined, lte: farFuture } },
        include: { staff: true },
        orderBy: { date: 'desc' },
      });
      expect(result[0]).toHaveProperty('staffAssessment');
    });

    it("scope OWN : refuse l'accès aux entretiens d'un autre joueur (403)", async () => {
      playerFindFirst.mockResolvedValue(player);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 999, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(interviewFindMany).not.toHaveBeenCalled();
    });

    it('scope OWN : autorise la lecture de ses propres entretiens', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([interview]);

      await expect(
        service.findAllByPlayer(1, 100, { memberId: 42, scope: 'OWN' }),
      ).resolves.toEqual([{ ...interview, staffAssessment: undefined }]);
    });

    it('scope OWN : ne renvoie jamais staffAssessment (ressenti interne de l’encadrant)', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([interview]);

      const [result] = await service.findAllByPlayer(1, 100, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result).not.toHaveProperty('staffAssessment');
      expect(result.staffFeedback).toBe('Continuer sur cette lancée');
    });

    it("scope OWN : plafonne toujours la borne haute à aujourd'hui, même sans dateTo transmis (pas d'entretiens à venir)", async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([]);

      await service.findAllByPlayer(1, 100, { memberId: 42, scope: 'OWN' });

      const [{ where }] = interviewFindMany.mock.calls[0] as [
        { where: { date: { lte: Date } } },
      ];
      const lte = where.date.lte;
      const now = new Date();
      expect(lte.getFullYear()).toBe(now.getFullYear());
      expect(lte.getMonth()).toBe(now.getMonth());
      expect(lte.getDate()).toBe(now.getDate());
      expect(lte.getHours()).toBe(23);
    });

    it("scope OWN : une dateTo future transmise en query est ramenée à aujourd'hui", async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([]);
      const farFuture = new Date('2099-01-01');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 42, scope: 'OWN' },
        { dateTo: farFuture },
      );

      const [{ where }] = interviewFindMany.mock.calls[0] as [
        { where: { date: { lte: Date } } },
      ];
      const lte = where.date.lte;
      expect(lte.getTime()).toBeLessThan(farFuture.getTime());
    });

    it('scope OWN : une dateTo passée transmise en query reste inchangée (plus restrictive)', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindMany.mockResolvedValue([]);
      const pastDate = new Date('2026-01-01');

      await service.findAllByPlayer(
        1,
        100,
        { memberId: 42, scope: 'OWN' },
        { dateTo: pastDate },
      );

      expect(interviewFindMany).toHaveBeenCalledWith({
        where: { playerId: 100, date: { gte: undefined, lte: pastDate } },
        include: { staff: true },
        orderBy: { date: 'desc' },
      });
    });
  });

  describe('update', () => {
    it("renvoie 404 si l'entretien n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 100, 1, { subject: 'Nouveau sujet' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(interviewUpdate).not.toHaveBeenCalled();
    });

    it('met à jour un entretien trouvé', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindFirst.mockResolvedValue(interview);
      interviewUpdate.mockResolvedValue({
        ...interview,
        subject: 'Nouveau sujet',
      });

      const result = await service.update(1, 100, 1, {
        subject: 'Nouveau sujet',
      });

      expect(result.subject).toBe('Nouveau sujet');
      expect(interviewUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          date: undefined,
          subject: 'Nouveau sujet',
          summary: undefined,
          staffFeedback: undefined,
          staffAssessment: undefined,
          playerFeedback: undefined,
        },
        include: { staff: true },
      });
    });

    it('complète un entretien planifié avec staffFeedback/staffAssessment/playerFeedback après coup', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindFirst.mockResolvedValue(interview);
      interviewUpdate.mockResolvedValue(interview);

      await service.update(1, 100, 1, {
        staffFeedback: 'Conclusions transmises au joueur',
        staffAssessment: 'Ressenti positif',
        playerFeedback: 'Le joueur se sent prêt',
      });

      expect(interviewUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          date: undefined,
          subject: undefined,
          summary: undefined,
          staffFeedback: 'Conclusions transmises au joueur',
          staffAssessment: 'Ressenti positif',
          playerFeedback: 'Le joueur se sent prêt',
        },
        include: { staff: true },
      });
    });
  });

  describe('remove', () => {
    it("renvoie 404 si l'entretien n'appartient pas à ce joueur", async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 100, 1)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(interviewDelete).not.toHaveBeenCalled();
    });

    it('supprime un entretien trouvé', async () => {
      playerFindFirst.mockResolvedValue(player);
      interviewFindFirst.mockResolvedValue(interview);

      await service.remove(1, 100, 1);

      expect(interviewDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});
