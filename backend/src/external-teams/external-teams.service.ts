import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateExternalTeamDto } from './dto/create-external-team.dto';
import { UpdateExternalTeamDto } from './dto/update-external-team.dto';

/**
 * CRUD des équipes adverses (docs/schema/championnats.md — ExternalTeam),
 * scopé CLUB (pas d'équipe interne propriétaire — une équipe adverse peut
 * être affrontée par plusieurs équipes du même club, réutilisable d'une
 * saison à l'autre). L'URL ne porte que clubId ; un Coach (scope TEAM sur
 * `external_team`) doit transmettre `?teamId=` pour être autorisé — voir
 * docs/modules/auth-roles.md §"Patterns découverts".
 */
@Injectable()
export class ExternalTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  create(clubId: number, dto: CreateExternalTeamDto) {
    return this.prisma.externalTeam.create({
      data: {
        clubId,
        name: dto.name,
        city: dto.city,
        country: dto.country,
        notes: dto.notes,
      },
    });
  }

  async findAllByClub(clubId: number, memberId: number, teamId?: number) {
    const [data, canManage] = await Promise.all([
      this.prisma.externalTeam.findMany({
        where: { clubId },
        orderBy: { name: 'asc' },
      }),
      this.canManage(clubId, memberId, teamId),
    ]);
    return { data, canManage };
  }

  // `canManage` reflète la capacité d'écriture réelle (bouton Ajouter /
  // Modifier / Supprimer) — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). `teamId` transmis tel quel : un Coach n'a CREATE qu'en
  // scope TEAM (contrairement à `season`, où ce droit lui a été retiré),
  // omettre `teamId` ferait échouer le match pour lui à tort. Un scope
  // CLUB/ALL (AdminClub+) matche indépendamment de `teamId`.
  private async canManage(clubId: number, memberId: number, teamId?: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'external_team',
      { clubId, teamId },
    );
    return !!scope;
  }

  async findOne(clubId: number, id: number) {
    return this.findExternalTeamOrThrow(clubId, id);
  }

  async update(clubId: number, id: number, dto: UpdateExternalTeamDto) {
    await this.findExternalTeamOrThrow(clubId, id);
    return this.prisma.externalTeam.update({
      where: { id },
      data: {
        name: dto.name,
        city: dto.city,
        country: dto.country,
        notes: dto.notes,
      },
    });
  }

  async remove(clubId: number, id: number) {
    await this.findExternalTeamOrThrow(clubId, id);
    await this.prisma.externalTeam.delete({ where: { id } });
  }

  private async findExternalTeamOrThrow(clubId: number, id: number) {
    const externalTeam = await this.prisma.externalTeam.findFirst({
      where: { id, clubId },
    });
    if (!externalTeam) {
      throw new AppException('EXTERNAL_TEAMS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return externalTeam;
  }
}
