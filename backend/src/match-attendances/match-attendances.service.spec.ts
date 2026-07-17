import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MatchAttendancesService } from './match-attendances.service';

describe('MatchAttendancesService', () => {
  let teamFindFirst: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let matchFindFirst: jest.Mock;
  let attendanceFindFirst: jest.Mock;
  let attendanceFindMany: jest.Mock;
  let attendanceCreateMany: jest.Mock;
  let attendanceUpdate: jest.Mock;
  let attendanceDelete: jest.Mock;
  let playerProfileFindFirst: jest.Mock;
  let playerProfileFindMany: jest.Mock;
  let playerProfileFindUniqueOrThrow: jest.Mock;
  let parentChildFindMany: jest.Mock;
  let parentChildFindUnique: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: MatchAttendancesService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue({ id: 5, clubId: 1 });
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    matchFindFirst = jest.fn().mockResolvedValue({ id: 900 });
    attendanceFindFirst = jest.fn();
    attendanceFindMany = jest.fn().mockResolvedValue([]);
    attendanceCreateMany = jest.fn();
    attendanceUpdate = jest.fn();
    attendanceDelete = jest.fn();
    playerProfileFindFirst = jest.fn();
    playerProfileFindMany = jest.fn().mockResolvedValue([]);
    playerProfileFindUniqueOrThrow = jest.fn();
    parentChildFindMany = jest.fn().mockResolvedValue([]);
    parentChildFindUnique = jest.fn().mockResolvedValue(null);

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerTeam: { findFirst: playerTeamFindFirst },
      match: { findFirst: matchFindFirst },
      matchAttendance: {
        findFirst: attendanceFindFirst,
        findMany: attendanceFindMany,
        createMany: attendanceCreateMany,
        update: attendanceUpdate,
        delete: attendanceDelete,
      },
      playerProfile: {
        findFirst: playerProfileFindFirst,
        findMany: playerProfileFindMany,
        findUniqueOrThrow: playerProfileFindUniqueOrThrow,
      },
      parentChild: {
        findMany: parentChildFindMany,
        findUnique: parentChildFindUnique,
      },
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new MatchAttendancesService(prismaStub, permissionsStub);
  });

  describe('createBulk', () => {
    it('convoque les joueurs sélectionnés, vérifie leur appartenance à l’équipe', async () => {
      await service.createBulk(1, 5, 900, [10, 11]);

      expect(playerTeamFindFirst).toHaveBeenCalledTimes(2);
      expect(attendanceCreateMany).toHaveBeenCalledWith({
        data: [
          { matchId: 900, playerId: 10 },
          { matchId: 900, playerId: 11 },
        ],
      });
    });

    it('ignore les joueurs déjà convoqués (idempotent)', async () => {
      attendanceFindMany.mockResolvedValueOnce([{ playerId: 10 }]);

      await service.createBulk(1, 5, 900, [10, 11]);

      expect(attendanceCreateMany).toHaveBeenCalledWith({
        data: [{ matchId: 900, playerId: 11 }],
      });
    });

    it('rejette un joueur qui n’appartient pas à l’équipe', async () => {
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(service.createBulk(1, 5, 900, [10])).rejects.toBeInstanceOf(
        AppException,
      );
      expect(attendanceCreateMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllByMatch', () => {
    it('scope TEAM : renvoie toutes les convocations sans filtre supplémentaire, avec canManage', async () => {
      attendanceFindMany.mockResolvedValue([{ id: 1 }]);

      const result = await service.findAllByMatch(1, 5, 900, {
        memberId: 42,
        scope: 'TEAM',
      });

      expect(attendanceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { matchId: 900 } }),
      );
      expect(result).toEqual({ data: [{ id: 1 }], canManage: true });
    });

    it('canManage=false pour un membre sans droit de convocation (CREATE)', async () => {
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByMatch(1, 5, 900, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result.canManage).toBe(false);
    });

    it('scope OWN : filtre sur le profil joueur du membre appelant', async () => {
      playerProfileFindFirst.mockResolvedValue({ id: 77 });

      await service.findAllByMatch(1, 5, 900, { memberId: 42, scope: 'OWN' });

      expect(attendanceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { matchId: 900, playerId: 77 } }),
      );
    });

    it('scope OWN sans profil joueur : filtre sur un id impossible (liste vide, pas une erreur)', async () => {
      playerProfileFindFirst.mockResolvedValue(null);

      await service.findAllByMatch(1, 5, 900, { memberId: 42, scope: 'OWN' });

      expect(attendanceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { matchId: 900, playerId: -1 } }),
      );
    });

    it('scope PARENT : filtre sur les profils joueurs des enfants liés', async () => {
      parentChildFindMany.mockResolvedValue([{ childMemberId: 200 }]);
      playerProfileFindMany.mockResolvedValue([{ id: 55 }]);

      await service.findAllByMatch(1, 5, 900, {
        memberId: 42,
        scope: 'PARENT',
      });

      expect(attendanceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { matchId: 900, playerId: { in: [55] } },
        }),
      );
    });
  });

  describe('update', () => {
    it('scope TEAM : modifie convocationStatus et attendanceStatus librement', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });

      await service.update(
        1,
        5,
        900,
        1,
        { convocationStatus: 'ACCEPTED', attendanceStatus: 'PRESENT' },
        { memberId: 42, scope: 'TEAM' },
      );

      expect(attendanceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { convocationStatus: 'ACCEPTED', attendanceStatus: 'PRESENT' },
        }),
      );
    });

    it('scope OWN : rejette une tentative de renseigner attendanceStatus', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });

      await expect(
        service.update(
          1,
          5,
          900,
          1,
          { attendanceStatus: 'PRESENT' },
          { memberId: 42, scope: 'OWN' },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(attendanceUpdate).not.toHaveBeenCalled();
    });

    it('scope OWN : rejette un retour à PENDING', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });

      await expect(
        service.update(
          1,
          5,
          900,
          1,
          { convocationStatus: 'PENDING' },
          { memberId: 42, scope: 'OWN' },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(attendanceUpdate).not.toHaveBeenCalled();
    });

    it('scope OWN : rejette la réponse à la convocation d’un autre joueur', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });
      playerProfileFindUniqueOrThrow.mockResolvedValue({
        id: 77,
        memberId: 999,
      });

      await expect(
        service.update(
          1,
          5,
          900,
          1,
          { convocationStatus: 'ACCEPTED' },
          { memberId: 42, scope: 'OWN' },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(attendanceUpdate).not.toHaveBeenCalled();
    });

    it('scope OWN : accepte sa propre convocation', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });
      playerProfileFindUniqueOrThrow.mockResolvedValue({
        id: 77,
        memberId: 42,
      });

      await service.update(
        1,
        5,
        900,
        1,
        { convocationStatus: 'ACCEPTED' },
        { memberId: 42, scope: 'OWN' },
      );

      expect(attendanceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { convocationStatus: 'ACCEPTED' } }),
      );
    });

    it('scope PARENT : rejette la réponse pour un enfant non lié', async () => {
      attendanceFindFirst.mockResolvedValue({
        id: 1,
        matchId: 900,
        playerId: 77,
      });
      playerProfileFindUniqueOrThrow.mockResolvedValue({
        id: 77,
        memberId: 200,
      });

      await expect(
        service.update(
          1,
          5,
          900,
          1,
          { convocationStatus: 'DECLINED' },
          { memberId: 42, scope: 'PARENT' },
        ),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('remove', () => {
    it('supprime une convocation existante', async () => {
      attendanceFindFirst.mockResolvedValue({ id: 1, matchId: 900 });

      await service.remove(1, 5, 900, 1);

      expect(attendanceDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('renvoie 404 si la convocation est introuvable', async () => {
      attendanceFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 900, 1)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(attendanceDelete).not.toHaveBeenCalled();
    });
  });
});
