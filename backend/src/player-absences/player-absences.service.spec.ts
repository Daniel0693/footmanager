import { HttpStatus } from '@nestjs/common';
import type { PlayerAbsence, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { PlayerAbsencesService } from './player-absences.service';

// Stubs par défaut : seule findMineInClub appelle findByUserAndClub()/can(),
// les autres tests n'ont pas besoin d'un comportement spécifique ici.
const membersServiceStub = {
  findByUserAndClub: jest.fn(),
} as unknown as MembersService;
const permissionsServiceStub = {
  can: jest.fn(),
} as unknown as PermissionsService;

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
    reason: 'Blessure au genou',
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

    service = new PlayerAbsencesService(
      prismaStub,
      membersServiceStub,
      permissionsServiceStub,
    );
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
            reason: 'Blessure',
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
          reason: 'Blessure au genou',
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
          reason: 'Blessure au genou',
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
            reason: 'Blessure',
            startDate: new Date('2026-07-10'),
            endDate: new Date('2026-07-20'),
          },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
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

  describe('findMineInClub', () => {
    const caller = { id: 42, userId: 7 };

    function absenceWithMember(overrides: Partial<PlayerAbsence> = {}) {
      return {
        ...absence(overrides),
        player: {
          ...player,
          member: { firstName: 'Tom', lastName: 'Joueur' },
        },
      };
    }

    it("renvoie 403 si l'appelant n'a pas de fiche membre dans ce club", async () => {
      const findByUserAndClub = jest.fn().mockResolvedValue(null);
      const membersStub = { findByUserAndClub } as unknown as MembersService;
      const svc = new PlayerAbsencesService(
        {} as PrismaService,
        membersStub,
        permissionsServiceStub,
      );

      await expect(
        svc.findMineInClub(1, 999, {
          dateFrom: new Date(2026, 0, 1),
          dateTo: new Date(2026, 11, 31),
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('scope CLUB/ALL : toutes les absences du club dont la période chevauche la fenêtre demandée', async () => {
      const findByUserAndClub = jest.fn().mockResolvedValue(caller);
      const membersStub = { findByUserAndClub } as unknown as MembersService;
      const can = jest.fn().mockResolvedValue('CLUB');
      const permissionsStub = { can } as unknown as PermissionsService;
      const found = absenceWithMember();
      absenceFindMany.mockResolvedValue([found]);
      const prismaStub = {
        playerAbsence: { findMany: absenceFindMany },
      } as unknown as PrismaService;
      const svc = new PlayerAbsencesService(
        prismaStub,
        membersStub,
        permissionsStub,
      );

      const dateFrom = new Date(2026, 0, 1);
      const dateTo = new Date(2026, 11, 31);
      const result = await svc.findMineInClub(1, 7, { dateFrom, dateTo });

      expect(can).toHaveBeenCalledWith(42, 'READ', 'player_absence', {
        clubId: 1,
      });
      expect(absenceFindMany).toHaveBeenCalledWith({
        where: {
          player: { member: { clubId: 1 } },
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
        include: { player: { include: { member: true } } },
        orderBy: { startDate: 'asc' },
      });
      expect(result).toEqual([
        {
          id: found.id,
          playerId: found.playerId,
          firstName: 'Tom',
          lastName: 'Joueur',
          reason: found.reason,
          startDate: found.startDate,
          endDate: found.endDate,
          isExcused: found.isExcused,
        },
      ]);
    });

    it('scope TEAM : restreint aux joueurs ayant un PlayerTeam actif sur une équipe accessible', async () => {
      const findByUserAndClub = jest.fn().mockResolvedValue(caller);
      const membersStub = { findByUserAndClub } as unknown as MembersService;
      const can = jest.fn().mockResolvedValue(null);
      const permissionsStub = { can } as unknown as PermissionsService;
      const teamFindMany = jest.fn().mockResolvedValue([{ id: 5 }]);
      absenceFindMany.mockResolvedValue([]);
      const prismaStub = {
        playerAbsence: { findMany: absenceFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService;
      const svc = new PlayerAbsencesService(
        prismaStub,
        membersStub,
        permissionsStub,
      );

      const dateFrom = new Date(2026, 0, 1);
      const dateTo = new Date(2026, 11, 31);
      await svc.findMineInClub(1, 7, { dateFrom, dateTo });

      expect(teamFindMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        },
        select: { id: true },
      });
      expect(absenceFindMany).toHaveBeenCalledWith({
        where: {
          player: {
            member: { clubId: 1 },
            playerTeams: { some: { teamId: { in: [5] }, leaveDate: null } },
          },
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
        include: { player: { include: { member: true } } },
        orderBy: { startDate: 'asc' },
      });
    });

    it('scope TEAM sans équipe accessible : liste vide, aucune requête sur PlayerAbsence', async () => {
      const findByUserAndClub = jest.fn().mockResolvedValue(caller);
      const membersStub = { findByUserAndClub } as unknown as MembersService;
      const can = jest.fn().mockResolvedValue(null);
      const permissionsStub = { can } as unknown as PermissionsService;
      const teamFindMany = jest.fn().mockResolvedValue([]);
      const prismaStub = {
        playerAbsence: { findMany: absenceFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService;
      const svc = new PlayerAbsencesService(
        prismaStub,
        membersStub,
        permissionsStub,
      );

      const result = await svc.findMineInClub(1, 7, {
        dateFrom: new Date(2026, 0, 1),
        dateTo: new Date(2026, 11, 31),
      });

      expect(result).toEqual([]);
      expect(absenceFindMany).not.toHaveBeenCalled();
    });
  });
});
