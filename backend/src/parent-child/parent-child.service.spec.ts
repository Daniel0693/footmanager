import { HttpStatus } from '@nestjs/common';
import type { Member, ParentChild, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParentChildService } from './parent-child.service';

const player: PlayerProfile = {
  id: 900,
  memberId: 90,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const parentMember: Member = {
  id: 60,
  userId: 80,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Martin',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function link(overrides: Partial<ParentChild> = {}): ParentChild {
  return {
    id: 1,
    parentMemberId: 60,
    childMemberId: 90,
    createdAt: new Date('2026-07-15'),
    updatedAt: new Date('2026-07-15'),
    ...overrides,
  };
}

describe('ParentChildService', () => {
  let playerFindFirst: jest.Mock;
  let memberFindFirst: jest.Mock;
  let parentChildFindUnique: jest.Mock;
  let parentChildFindMany: jest.Mock;
  let parentChildFindFirst: jest.Mock;
  let parentChildCreate: jest.Mock;
  let parentChildDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let resolveOrProvisionMember: jest.Mock;
  let service: ParentChildService;

  beforeEach(() => {
    playerFindFirst = jest.fn().mockResolvedValue(player);
    memberFindFirst = jest.fn().mockResolvedValue(parentMember);
    parentChildFindUnique = jest.fn().mockResolvedValue(null);
    parentChildFindMany = jest.fn().mockResolvedValue([]);
    parentChildFindFirst = jest.fn().mockResolvedValue(link());
    parentChildCreate = jest.fn().mockResolvedValue(link());
    parentChildDelete = jest.fn().mockResolvedValue(link());
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    resolveOrProvisionMember = jest.fn().mockResolvedValue(parentMember);

    const prismaStub = {
      playerProfile: { findFirst: playerFindFirst },
      member: { findFirst: memberFindFirst },
      parentChild: {
        findUnique: parentChildFindUnique,
        findMany: parentChildFindMany,
        findFirst: parentChildFindFirst,
        create: parentChildCreate,
        delete: parentChildDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    const membersServiceStub = {
      resolveOrProvisionMember,
    } as unknown as MembersService;

    service = new ParentChildService(prismaStub, membersServiceStub);
  });

  describe('create', () => {
    it("refuse si le joueur n'appartient pas au club", async () => {
      playerFindFirst.mockResolvedValue(null);
      await expect(
        service.create(
          1,
          900,
          { parentMemberId: 60 },
          { memberId: 1, scope: 'CLUB' },
        ),
      ).rejects.toBeInstanceOf(AppException);
    });

    it("refuse si le Member parent n'appartient pas au club (400)", async () => {
      memberFindFirst.mockResolvedValue(null);
      await expect(
        service.create(
          1,
          900,
          { parentMemberId: 60 },
          { memberId: 1, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('refuse de lier un joueur à lui-même', async () => {
      memberFindFirst.mockResolvedValue({ ...parentMember, id: 90 });
      await expect(
        service.create(
          1,
          900,
          { parentMemberId: 90 },
          { memberId: 1, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('refuse un lien déjà existant (409)', async () => {
      parentChildFindUnique.mockResolvedValue(link());
      await expect(
        service.create(
          1,
          900,
          { parentMemberId: 60 },
          { memberId: 1, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(parentChildCreate).not.toHaveBeenCalled();
    });

    it('crée le lien parent-enfant', async () => {
      const result = await service.create(
        1,
        900,
        { parentMemberId: 60 },
        { memberId: 1, scope: 'CLUB' },
      );
      expect(parentChildCreate).toHaveBeenCalledWith({
        data: { parentMemberId: 60, childMemberId: 90 },
        include: { parentMember: true },
      });
      expect(result).toEqual(link());
    });

    it('Coach (scope TEAM) : vérifie l’appartenance du joueur à son équipe', async () => {
      playerTeamFindFirst.mockResolvedValue(null);
      await expect(
        service.create(
          1,
          900,
          { parentMemberId: 60 },
          { memberId: 1, scope: 'TEAM', teamId: 5 },
        ),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('findAllByPlayer', () => {
    it('liste les parents liés à ce joueur', async () => {
      parentChildFindMany.mockResolvedValue([link()]);
      const result = await service.findAllByPlayer(1, 900, {
        memberId: 1,
        scope: 'CLUB',
      });
      expect(parentChildFindMany).toHaveBeenCalledWith({
        where: { childMemberId: 90 },
        include: { parentMember: true },
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual([link()]);
    });
  });

  describe('remove', () => {
    it("refuse si le lien n'existe pas pour ce joueur (404)", async () => {
      parentChildFindFirst.mockResolvedValue(null);
      await expect(
        service.remove(1, 900, 1, { memberId: 1, scope: 'CLUB' }),
      ).rejects.toBeInstanceOf(AppException);
      expect(parentChildDelete).not.toHaveBeenCalled();
    });

    it('supprime le lien', async () => {
      await service.remove(1, 900, 1, { memberId: 1, scope: 'CLUB' });
      expect(parentChildDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('findMineInClub', () => {
    it('résout le Member appelant puis liste ses enfants liés (self-service, pas de scope RBAC)', async () => {
      parentChildFindMany.mockResolvedValue([link()]);
      const result = await service.findMineInClub(1, 80);
      expect(resolveOrProvisionMember).toHaveBeenCalledWith(80, 1);
      expect(parentChildFindMany).toHaveBeenCalledWith({
        where: { parentMemberId: 60 },
        include: { childMember: { include: { playerProfile: true } } },
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual([link()]);
    });
  });
});
