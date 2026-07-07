import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Configuration du radar d'évaluation d'un club (docs/schema/joueurs.md —
 * ClubEvaluationConfig). Pure lecture de référence, club-wide : pas de
 * vérification joueur/équipe ici (contrairement aux autres modules
 * Effectif), seule la permission `evaluation_config READ` sur ce club est
 * évaluée par PermissionsGuard.
 */
@Injectable()
export class EvaluationConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByClub(clubId: number) {
    const configs = await this.prisma.clubEvaluationConfig.findMany({
      where: { clubId, isEnabled: true },
      include: {
        category: {
          include: {
            criteria: {
              where: { OR: [{ clubId: null }, { clubId }] },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });

    return configs
      .map((config) => ({
        id: config.id,
        categoryId: config.categoryId,
        name: config.customName ?? config.category.name,
        displayOrder:
          config.displayOrder ?? config.category.defaultDisplayOrder,
        criteria: config.category.criteria.map((criterion) => ({
          id: criterion.id,
          name: criterion.name,
          description: criterion.description,
        })),
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
