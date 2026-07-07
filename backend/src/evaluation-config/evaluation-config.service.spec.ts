import { PrismaService } from '../prisma/prisma.service';
import { EvaluationConfigService } from './evaluation-config.service';

describe('EvaluationConfigService', () => {
  let clubEvaluationConfigFindMany: jest.Mock;
  let service: EvaluationConfigService;

  beforeEach(() => {
    clubEvaluationConfigFindMany = jest.fn();
    const prismaStub = {
      clubEvaluationConfig: { findMany: clubEvaluationConfigFindMany },
    } as unknown as PrismaService;

    service = new EvaluationConfigService(prismaStub);
  });

  it('ne consulte que les configurations activées (isEnabled: true) du club', async () => {
    clubEvaluationConfigFindMany.mockResolvedValue([]);

    await service.findAllByClub(1);

    expect(clubEvaluationConfigFindMany).toHaveBeenCalledWith({
      where: { clubId: 1, isEnabled: true },
      include: {
        category: {
          include: {
            criteria: {
              where: { OR: [{ clubId: null }, { clubId: 1 }] },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
  });

  it('utilise customName/displayOrder si définis, sinon retombe sur ceux de la catégorie', async () => {
    clubEvaluationConfigFindMany.mockResolvedValue([
      {
        id: 1,
        categoryId: 10,
        customName: null,
        displayOrder: null,
        category: {
          name: 'Technique',
          defaultDisplayOrder: 2,
          criteria: [{ id: 100, name: 'Passe', description: null }],
        },
      },
      {
        id: 2,
        categoryId: 20,
        customName: 'Mental (perso)',
        displayOrder: 1,
        category: {
          name: 'Mental',
          defaultDisplayOrder: 5,
          criteria: [],
        },
      },
    ]);

    const result = await service.findAllByClub(1);

    expect(result).toEqual([
      {
        id: 2,
        categoryId: 20,
        name: 'Mental (perso)',
        displayOrder: 1,
        criteria: [],
      },
      {
        id: 1,
        categoryId: 10,
        name: 'Technique',
        displayOrder: 2,
        criteria: [{ id: 100, name: 'Passe', description: null }],
      },
    ]);
  });

  it('trie les axes du radar par displayOrder croissant', async () => {
    clubEvaluationConfigFindMany.mockResolvedValue([
      {
        id: 1,
        categoryId: 10,
        customName: null,
        displayOrder: 3,
        category: { name: 'A', defaultDisplayOrder: 3, criteria: [] },
      },
      {
        id: 2,
        categoryId: 20,
        customName: null,
        displayOrder: 1,
        category: { name: 'B', defaultDisplayOrder: 1, criteria: [] },
      },
      {
        id: 3,
        categoryId: 30,
        customName: null,
        displayOrder: 2,
        category: { name: 'C', defaultDisplayOrder: 2, criteria: [] },
      },
    ]);

    const result = await service.findAllByClub(1);

    expect(result.map((axis) => axis.categoryId)).toEqual([20, 30, 10]);
  });
});
