import { HttpStatus } from '@nestjs/common';
import type { Member, Team } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { TeamsService } from './teams.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const coachMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TeamsService', () => {
  let findFirst: jest.Mock;
  let findMany: jest.Mock;
  let update: jest.Mock;
  let deleteTeam: jest.Mock;
  let memberRoleCount: jest.Mock;
  let playerTeamCount: jest.Mock;
  let teamStaffCount: jest.Mock;
  let championshipCount: jest.Mock;
  let eventCount: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let can: jest.Mock;
  let service: TeamsService;

  beforeEach(() => {
    findFirst = jest.fn();
    findMany = jest.fn();
    update = jest.fn();
    deleteTeam = jest.fn();
    memberRoleCount = jest.fn().mockResolvedValue(0);
    playerTeamCount = jest.fn().mockResolvedValue(0);
    teamStaffCount = jest.fn().mockResolvedValue(0);
    championshipCount = jest.fn().mockResolvedValue(0);
    eventCount = jest.fn().mockResolvedValue(0);
    findByUserAndClub = jest.fn();
    can = jest.fn();
    const prismaStub = {
      team: { findFirst, findMany, update, delete: deleteTeam },
      memberRole: { count: memberRoleCount },
      playerTeam: { count: playerTeamCount },
      teamStaff: { count: teamStaffCount },
      championship: { count: championshipCount },
      event: { count: eventCount },
    } as unknown as PrismaService;
    const membersServiceStub = {
      findByUserAndClub,
    } as unknown as MembersService;
    const permissionsServiceStub = { can } as unknown as PermissionsService;
    service = new TeamsService(
      prismaStub,
      membersServiceStub,
      permissionsServiceStub,
    );
  });

  describe('findByIdInClub', () => {
    it('renvoie 404 si l’équipe est introuvable dans ce club', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.findByIdInClub(1, 5)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it("renvoie l'équipe trouvée dans ce club", async () => {
      findFirst.mockResolvedValue(team);

      await expect(service.findByIdInClub(1, 5)).resolves.toBe(team);
      expect(findFirst).toHaveBeenCalledWith({ where: { id: 5, clubId: 1 } });
    });
  });

  describe('findAllByClub', () => {
    it('liste les équipes du club, triées par nom', async () => {
      findMany.mockResolvedValue([team]);

      const result = await service.findAllByClub(1);

      expect(result).toEqual([team]);
      expect(findMany).toHaveBeenCalledWith({
        where: { clubId: 1 },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findMineInClub', () => {
    it("refuse si l'appelant n'est pas Member de ce club", async () => {
      findByUserAndClub.mockResolvedValue(null);

      await expect(service.findMineInClub(1, 7)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('scope club-wide (CLUB/ALL) et canManage=true (AdminClub) : renvoie toutes les équipes du club', async () => {
      findByUserAndClub.mockResolvedValue(coachMember);
      can.mockResolvedValue('CLUB');
      findMany.mockResolvedValue([team]);

      const result = await service.findMineInClub(1, 7);

      expect(result).toEqual({ data: [team], canManage: true });
      expect(findMany).toHaveBeenCalledWith({
        where: { clubId: 1 },
        orderBy: { name: 'asc' },
      });
    });

    it('pas de scope club-wide et canManage=false (ex. Coach) : ne renvoie que les équipes où le membre a un rôle scopé équipe, sans droit de gestion', async () => {
      findByUserAndClub.mockResolvedValue(coachMember);
      can.mockResolvedValue(null);
      findMany.mockResolvedValue([team]);

      const result = await service.findMineInClub(1, 7);

      expect(result).toEqual({ data: [team], canManage: false });
      expect(can).toHaveBeenCalledWith(42, 'READ', 'team', { clubId: 1 });
      expect(can).toHaveBeenCalledWith(42, 'UPDATE', 'team', { clubId: 1 });
      expect(findMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si l’équipe est introuvable dans ce club', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, { name: 'Nouveau nom' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(update).not.toHaveBeenCalled();
    });

    it('renomme une équipe existante', async () => {
      findFirst.mockResolvedValue(team);
      update.mockResolvedValue({ ...team, name: 'Nouveau nom' });

      const result = await service.update(1, 5, { name: 'Nouveau nom' });

      expect(result.name).toBe('Nouveau nom');
      expect(update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { name: 'Nouveau nom' },
      });
    });
  });

  describe('remove', () => {
    it('renvoie 404 si l’équipe est introuvable dans ce club', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(deleteTeam).not.toHaveBeenCalled();
    });

    it('supprime une équipe vide (aucun membre, joueur, événement ni championnat)', async () => {
      findFirst.mockResolvedValue(team);

      await service.remove(1, 5);

      expect(deleteTeam).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('refuse de supprimer une équipe qui a déjà des joueurs affectés', async () => {
      findFirst.mockResolvedValue(team);
      playerTeamCount.mockResolvedValue(1);

      await expect(service.remove(1, 5)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(deleteTeam).not.toHaveBeenCalled();
    });

    it('refuse de supprimer une équipe qui a déjà un championnat', async () => {
      findFirst.mockResolvedValue(team);
      championshipCount.mockResolvedValue(1);

      await expect(service.remove(1, 5)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(deleteTeam).not.toHaveBeenCalled();
    });
  });
});
