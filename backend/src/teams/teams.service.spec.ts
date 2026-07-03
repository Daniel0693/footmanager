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
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TeamsService', () => {
  let findFirst: jest.Mock;
  let findMany: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let can: jest.Mock;
  let service: TeamsService;

  beforeEach(() => {
    findFirst = jest.fn();
    findMany = jest.fn();
    findByUserAndClub = jest.fn();
    can = jest.fn();
    const prismaStub = {
      team: { findFirst, findMany },
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

    it('scope club-wide (CLUB/ALL) : renvoie toutes les équipes du club', async () => {
      findByUserAndClub.mockResolvedValue(coachMember);
      can.mockResolvedValue('CLUB');
      findMany.mockResolvedValue([team]);

      const result = await service.findMineInClub(1, 7);

      expect(result).toEqual([team]);
      expect(findMany).toHaveBeenCalledWith({
        where: { clubId: 1 },
        orderBy: { name: 'asc' },
      });
    });

    it('pas de scope club-wide (ex. Coach) : ne renvoie que les équipes où le membre a un rôle scopé équipe', async () => {
      findByUserAndClub.mockResolvedValue(coachMember);
      can.mockResolvedValue(null);
      findMany.mockResolvedValue([team]);

      const result = await service.findMineInClub(1, 7);

      expect(result).toEqual([team]);
      expect(can).toHaveBeenCalledWith(42, 'READ', 'team', { clubId: 1 });
      expect(findMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        },
        orderBy: { name: 'asc' },
      });
    });
  });
});
