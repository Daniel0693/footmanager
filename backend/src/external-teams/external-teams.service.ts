import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

  findAllByClub(clubId: number) {
    return this.prisma.externalTeam.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
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
