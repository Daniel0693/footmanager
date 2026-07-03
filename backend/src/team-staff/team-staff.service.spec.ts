import { HttpStatus } from '@nestjs/common';
import type { Member, Team, TeamStaff } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamStaffService } from './team-staff.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const member: Member = {
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

const principalAssignment: TeamStaff = {
  id: 300,
  teamId: 5,
  memberId: 1, // le Principal, pas Marc
  staffRole: 'PRINCIPAL',
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adjointAssignment: TeamStaff = {
  id: 301,
  teamId: 5,
  memberId: 42, // Marc, Adjoint
  staffRole: 'ADJOINT',
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TeamStaffService', () => {
  let teamFindFirst: jest.Mock;
  let memberFindFirst: jest.Mock;
  let tsFindFirst: jest.Mock;
  let tsFindMany: jest.Mock;
  let tsCreate: jest.Mock;
  let tsUpdate: jest.Mock;
  let tsDelete: jest.Mock;
  let service: TeamStaffService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    memberFindFirst = jest.fn();
    tsFindFirst = jest.fn();
    tsFindMany = jest.fn();
    tsCreate = jest.fn();
    tsUpdate = jest.fn();
    tsDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      member: { findFirst: memberFindFirst },
      teamStaff: {
        findFirst: tsFindFirst,
        findMany: tsFindMany,
        create: tsCreate,
        update: tsUpdate,
        delete: tsDelete,
      },
    } as unknown as PrismaService;

    service = new TeamStaffService(prismaStub);
  });

  describe('create', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, { memberId: 42, staffRole: 'ADJOINT' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(tsCreate).not.toHaveBeenCalled();
    });

    it("refuse si le membre n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, { memberId: 42, staffRole: 'ADJOINT' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(tsCreate).not.toHaveBeenCalled();
    });

    it('refuse si le membre a déjà une affectation active dans le staff de cette équipe', async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(member);
      tsFindFirst.mockResolvedValue(adjointAssignment);

      await expect(
        service.create(1, 5, { memberId: 42, staffRole: 'CO_ENTRAINEUR' }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(tsCreate).not.toHaveBeenCalled();
    });

    it('crée l’affectation quand toutes les vérifications passent', async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(member);
      tsFindFirst.mockResolvedValue(null);
      tsCreate.mockResolvedValue(adjointAssignment);

      const result = await service.create(1, 5, {
        memberId: 42,
        staffRole: 'ADJOINT',
      });

      expect(result).toBe(adjointAssignment);
      expect(tsCreate).toHaveBeenCalledWith({
        data: {
          memberId: 42,
          teamId: 5,
          staffRole: 'ADJOINT',
          startDate: undefined,
        },
      });
    });
  });

  describe('findAllByTeam', () => {
    it('ne renvoie que les affectations actives (endDate null)', async () => {
      teamFindFirst.mockResolvedValue(team);
      tsFindMany.mockResolvedValue([adjointAssignment]);

      const result = await service.findAllByTeam(1, 5);

      expect(result).toEqual([adjointAssignment]);
      expect(tsFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, endDate: null },
        orderBy: { staffRole: 'asc' },
      });
    });
  });

  describe('update — exception de protection du Principal', () => {
    it("un scope TEAM (Adjoint/Co-entraîneur) ne peut pas modifier la fiche d'un AUTRE membre Principal", async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await expect(
        service.update(
          1,
          5,
          300,
          { staffRole: 'CO_ENTRAINEUR' },
          {
            memberId: 42,
            scope: 'TEAM',
          },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(tsUpdate).not.toHaveBeenCalled();
    });

    it('un scope TEAM peut modifier sa PROPRE fiche même si elle est Principal', async () => {
      const ownPrincipal = { ...principalAssignment, memberId: 42 };
      tsFindFirst.mockResolvedValue(ownPrincipal);
      tsUpdate.mockResolvedValue(ownPrincipal);

      await expect(
        service.update(
          1,
          5,
          300,
          { startDate: new Date('2026-01-01') },
          {
            memberId: 42,
            scope: 'TEAM',
          },
        ),
      ).resolves.toBe(ownPrincipal);
    });

    it('un scope TEAM peut modifier la fiche d’un Adjoint/Co-entraîneur (non Principal)', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tsUpdate.mockResolvedValue(adjointAssignment);

      await expect(
        service.update(
          1,
          5,
          301,
          { staffRole: 'CO_ENTRAINEUR' },
          {
            memberId: 99,
            scope: 'TEAM',
          },
        ),
      ).resolves.toBe(adjointAssignment);
    });

    it('un scope CLUB (AdminClub) peut modifier la fiche du Principal', async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);
      tsUpdate.mockResolvedValue(principalAssignment);

      await expect(
        service.update(
          1,
          5,
          300,
          { staffRole: 'CO_ENTRAINEUR' },
          {
            memberId: 99,
            scope: 'CLUB',
          },
        ),
      ).resolves.toBe(principalAssignment);
    });

    it('renvoie 404 si l’affectation est introuvable dans cette équipe/club', async () => {
      tsFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 300, {}, { memberId: 42, scope: 'TEAM' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('remove — même exception que update', () => {
    it("un scope TEAM ne peut pas retirer la fiche d'un AUTRE membre Principal", async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await expect(
        service.remove(1, 5, 300, { memberId: 42, scope: 'TEAM' }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(tsDelete).not.toHaveBeenCalled();
    });

    it('un scope CLUB peut retirer la fiche du Principal', async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await service.remove(1, 5, 300, { memberId: 99, scope: 'CLUB' });

      expect(tsDelete).toHaveBeenCalledWith({ where: { id: 300 } });
    });
  });
});
