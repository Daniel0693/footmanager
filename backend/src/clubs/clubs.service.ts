import { HttpStatus, Injectable } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Crée un club et son premier Member (le créateur), qui reçoit le rôle
   * système AdminClub scopé à ce club. Génère aussi automatiquement les
   * ClubEvaluationConfig pour les EvaluationCategory système du sport choisi
   * (docs/schema/fondations.md §Club "Workflow de création").
   *
   * AdminClub, pas Proprietaire : depuis l'introduction des rôles plateforme
   * (UserRole, docs/modules/auth-roles.md §Rôles plateforme), Proprietaire/
   * SuperAdmin sont des rôles globaux réservés au personnel de la plateforme
   * — les accorder automatiquement à quiconque crée un club serait une
   * élévation de privilège. Ils sont désormais attribués exclusivement via
   * backend/scripts/bootstrap-platform-role.ts.
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

      const adminClubRole = await tx.role.findFirst({
        where: { name: 'AdminClub', isSystem: true, clubId: null },
      });
      if (!adminClubRole) {
        throw new AppException(
          'CLUB.SETUP_ROLE_MISSING',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      await tx.memberRole.create({
        data: {
          memberId: member.id,
          roleId: adminClubRole.id,
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

  /**
   * Clubs visibles par l'utilisateur : tous les clubs pour un titulaire d'un
   * rôle plateforme actif (UserRole — SuperAdmin/Proprietaire, docs/modules/
   * auth-roles.md §Rôles plateforme), sinon seulement ceux où il a une fiche
   * Member (peu importe le rôle local).
   */
  async findAllForUser(userId: number) {
    if (await this.permissionsService.hasActivePlatformRole(userId)) {
      return this.prisma.club.findMany({ orderBy: { name: 'asc' } });
    }
    return this.prisma.club.findMany({
      where: { members: { some: { userId } } },
      orderBy: { name: 'asc' },
    });
  }
}
