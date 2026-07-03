import { HttpStatus, Injectable } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateClubInput {
  name: string;
  country: string;
  city?: string;
  sport?: SportType;
  firstName: string;
  lastName: string;
  phone?: string;
}

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un club et son premier Member (le créateur), qui reçoit le rôle
   * système Proprietaire scopé à ce club. Génère aussi automatiquement les
   * ClubEvaluationConfig pour les EvaluationCategory système du sport choisi
   * (docs/schema/fondations.md §Club "Workflow de création").
   */
  async create(userId: number, dto: CreateClubInput) {
    const sport = dto.sport ?? 'FOOTBALL';

    return this.prisma.$transaction(async (tx) => {
      const club = await tx.club.create({
        data: { name: dto.name, country: dto.country, city: dto.city, sport },
      });

      const member = await tx.member.create({
        data: {
          userId,
          clubId: club.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });

      const proprietaireRole = await tx.role.findFirst({
        where: { name: 'Proprietaire', isSystem: true, clubId: null },
      });
      if (!proprietaireRole) {
        throw new AppException(
          'CLUB.SETUP_ROLE_MISSING',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      await tx.memberRole.create({
        data: {
          memberId: member.id,
          roleId: proprietaireRole.id,
          clubId: club.id,
        },
      });

      const categories = await tx.evaluationCategory.findMany({
        where: { isSystem: true, sport },
      });
      if (categories.length > 0) {
        await tx.clubEvaluationConfig.createMany({
          data: categories.map((category) => ({
            clubId: club.id,
            categoryId: category.id,
            isEnabled: true,
            displayOrder: category.defaultDisplayOrder,
          })),
        });
      }

      return club;
    });
  }

  /** Clubs où l'utilisateur a une fiche Member (peu importe le rôle). */
  findAllForUser(userId: number) {
    return this.prisma.club.findMany({
      where: { members: { some: { userId } } },
      orderBy: { name: 'asc' },
    });
  }
}
