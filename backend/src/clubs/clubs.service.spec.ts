import type { Club } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

describe('ClubsService', () => {
  describe('findAllForUser', () => {
    it("renvoie les clubs où l'utilisateur a une fiche Member", async () => {
      const findMany = jest.fn().mockResolvedValue([club]);
      const prismaStub = { club: { findMany } } as unknown as PrismaService;
      const service = new ClubsService(prismaStub);

      const result = await service.findAllForUser(7);

      expect(result).toEqual([club]);
      expect(findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 7 } } },
        orderBy: { name: 'asc' },
      });
    });
  });
});
