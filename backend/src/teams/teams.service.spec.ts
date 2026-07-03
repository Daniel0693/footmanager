import { HttpStatus } from '@nestjs/common';
import type { Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TeamsService', () => {
  let findFirst: jest.Mock;
  let findMany: jest.Mock;
  let service: TeamsService;

  beforeEach(() => {
    findFirst = jest.fn();
    findMany = jest.fn();
    const prismaStub = {
      team: { findFirst, findMany },
    } as unknown as PrismaService;
    service = new TeamsService(prismaStub);
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
});
