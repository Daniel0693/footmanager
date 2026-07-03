import type { Member } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from './members.service';

const member: Member = {
  id: 1,
  userId: null,
  clubId: 1,
  firstName: 'Tom',
  lastName: 'Joueur',
  phone: null,
  avatarUrl: null,
  gender: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('MembersService', () => {
  describe('create', () => {
    it('crée un membre sans userId (membre sans compte)', async () => {
      const create = jest.fn().mockResolvedValue(member);
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub);

      const result = await service.create({
        clubId: 1,
        firstName: 'Tom',
        lastName: 'Joueur',
      });

      expect(result).toBe(member);
      expect(create).toHaveBeenCalledWith({
        data: { clubId: 1, firstName: 'Tom', lastName: 'Joueur' },
      });
    });

    it('crée un membre avec userId quand fourni (ex. création de club)', async () => {
      const create = jest.fn().mockResolvedValue({ ...member, userId: 7 });
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub);

      await service.create({
        userId: 7,
        clubId: 1,
        firstName: 'Alice',
        lastName: 'Admin',
      });

      expect(create).toHaveBeenCalledWith({
        data: { userId: 7, clubId: 1, firstName: 'Alice', lastName: 'Admin' },
      });
    });

    it('crée un membre avec un genre renseigné', async () => {
      const create = jest.fn().mockResolvedValue({ ...member, gender: 'MALE' });
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub);

      await service.create({
        clubId: 1,
        firstName: 'Tom',
        lastName: 'Joueur',
        gender: 'MALE',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          clubId: 1,
          firstName: 'Tom',
          lastName: 'Joueur',
          gender: 'MALE',
        },
      });
    });
  });

  describe('update', () => {
    it('met à jour un membre existant du club', async () => {
      const findFirst = jest.fn().mockResolvedValue(member);
      const update = jest
        .fn()
        .mockResolvedValue({ ...member, firstName: 'Thomas' });
      const prismaStub = {
        member: { findFirst, update },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub);

      const result = await service.update(1, 1, { firstName: 'Thomas' });

      expect(findFirst).toHaveBeenCalledWith({ where: { id: 1, clubId: 1 } });
      expect(update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { firstName: 'Thomas' },
      });
      expect(result.firstName).toBe('Thomas');
    });

    it("rejette la mise à jour d'un membre absent du club (pas de fuite inter-club)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prismaStub = {
        member: { findFirst, update: jest.fn() },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub);

      await expect(
        service.update(2, 1, { firstName: 'Thomas' }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });
});
