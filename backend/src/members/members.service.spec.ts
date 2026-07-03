import type { Member } from '@prisma/client';
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
  });
});
