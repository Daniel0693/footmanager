import { HttpStatus } from '@nestjs/common';
import type { Club, Member, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ClubsService } from './clubs.service';

const club: Club = {
  id: 1,
  name: 'AVF',
  sport: 'FOOTBALL',
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  country: 'Suisse',
  city: 'Sion',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const member: Member = {
  id: 1,
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

const adminClubRole: Role = {
  id: 4,
  name: 'AdminClub',
  description: null,
  isSystem: true,
  clubId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ClubsService', () => {
  describe('findAllForUser', () => {
    it("renvoie TOUS les clubs pour un titulaire d'un rôle plateforme actif (UserRole)", async () => {
      const findMany = jest.fn().mockResolvedValue([club]);
      const prismaStub = { club: { findMany } } as unknown as PrismaService;
      const hasActivePlatformRole = jest.fn().mockResolvedValue(true);
      const permissionsServiceStub = {
        hasActivePlatformRole,
      } as unknown as PermissionsService;
      const service = new ClubsService(prismaStub, permissionsServiceStub);

      const result = await service.findAllForUser(500);

      expect(result).toEqual([club]);
      expect(hasActivePlatformRole).toHaveBeenCalledWith(500);
      expect(findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });

    it("renvoie les clubs où l'utilisateur a une fiche Member, sans rôle plateforme", async () => {
      const findMany = jest.fn().mockResolvedValue([club]);
      const prismaStub = { club: { findMany } } as unknown as PrismaService;
      const hasActivePlatformRole = jest.fn().mockResolvedValue(false);
      const permissionsServiceStub = {
        hasActivePlatformRole,
      } as unknown as PermissionsService;
      const service = new ClubsService(prismaStub, permissionsServiceStub);

      const result = await service.findAllForUser(7);

      expect(result).toEqual([club]);
      expect(findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 7 } } },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    function buildTxStub(
      overrides: {
        roleFindFirst?: jest.Mock;
        evaluationCategoryFindMany?: jest.Mock;
      } = {},
    ) {
      const clubCreate = jest.fn().mockResolvedValue(club);
      const memberCreate = jest.fn().mockResolvedValue(member);
      const roleFindFirst =
        overrides.roleFindFirst ?? jest.fn().mockResolvedValue(adminClubRole);
      const memberRoleCreate = jest.fn().mockResolvedValue({});
      const evaluationCategoryFindMany =
        overrides.evaluationCategoryFindMany ?? jest.fn().mockResolvedValue([]);
      const clubEvaluationConfigCreateMany = jest.fn();

      const tx = {
        club: { create: clubCreate },
        member: { create: memberCreate },
        role: { findFirst: roleFindFirst },
        memberRole: { create: memberRoleCreate },
        evaluationCategory: { findMany: evaluationCategoryFindMany },
        clubEvaluationConfig: { createMany: clubEvaluationConfigCreateMany },
      };

      return {
        tx,
        clubCreate,
        memberCreate,
        roleFindFirst,
        memberRoleCreate,
        evaluationCategoryFindMany,
        clubEvaluationConfigCreateMany,
      };
    }

    function buildService(tx: unknown) {
      const transaction = jest.fn((callback: (tx: unknown) => unknown) =>
        callback(tx),
      );
      const prismaStub = {
        $transaction: transaction,
      } as unknown as PrismaService;
      return new ClubsService(prismaStub, {} as PermissionsService);
    }

    it('crée le club et son premier Member, qui reçoit le rôle système AdminClub (jamais Proprietaire)', async () => {
      const { tx, memberRoleCreate, roleFindFirst } = buildTxStub();
      const service = buildService(tx);

      const result = await service.create(7, {
        name: 'AVF',
        country: 'Suisse',
        firstName: 'Marc',
        lastName: 'Dupont',
      });

      expect(result).toBe(club);
      expect(roleFindFirst).toHaveBeenCalledWith({
        where: { name: 'AdminClub', isSystem: true, clubId: null },
      });
      expect(memberRoleCreate).toHaveBeenCalledWith({
        data: {
          memberId: member.id,
          roleId: adminClubRole.id,
          clubId: club.id,
        },
      });
    });

    it("ne référence jamais le rôle Proprietaire à la création d'un club (correctif élévation de privilège)", async () => {
      const { tx, roleFindFirst } = buildTxStub();
      const service = buildService(tx);

      await service.create(7, {
        name: 'AVF',
        country: 'Suisse',
        firstName: 'Marc',
        lastName: 'Dupont',
      });

      const calledNames = (
        roleFindFirst.mock.calls as [{ where: { name: string } }][]
      ).map(([{ where }]) => where.name);
      expect(calledNames).not.toContain('Proprietaire');
    });

    it('échoue proprement si le rôle système AdminClub est introuvable (seed non exécuté)', async () => {
      const { tx } = buildTxStub({
        roleFindFirst: jest.fn().mockResolvedValue(null),
      });
      const service = buildService(tx);

      await expect(
        service.create(7, {
          name: 'AVF',
          country: 'Suisse',
          firstName: 'Marc',
          lastName: 'Dupont',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    });
  });
});
