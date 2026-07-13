import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { FindSeasonsQueryDto } from './dto/find-seasons-query.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

/**
 * CRUD des saisons (docs/schema/championnats.md — Season), scopé équipe.
 * L'URL porte toujours teamId (même pattern que Event/TeamStaff), donc pas
 * besoin du contournement `?teamId=` utilisé par les ressources scopées
 * joueur (voir docs/modules/auth-roles.md §Patterns découverts).
 */
@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  // Toujours créée en DRAFT (CreateSeasonDto n'expose pas `status`) — la
  // saison précédente reste ACTIVE tant que le wizard n'a pas été validé
  // (docs/modules/saisons-championnats.md, étape 1).
  async create(clubId: number, teamId: number, dto: CreateSeasonDto) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'SEASONS.TEAM_NOT_IN_CLUB',
    );

    return this.prisma.season.create({
      data: {
        teamId,
        name: dto.name,
        teamNameSnapshot: dto.teamNameSnapshot,
        categorySnapshot: dto.categorySnapshot,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: 'DRAFT',
      },
    });
  }

  async findAllByTeam(
    clubId: number,
    teamId: number,
    query: FindSeasonsQueryDto = {},
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'SEASONS.TEAM_NOT_IN_CLUB',
    );

    return this.prisma.season.findMany({
      where: { teamId, status: query.status },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(clubId: number, teamId: number, id: number) {
    return this.findSeasonOrThrow(clubId, teamId, id);
  }

  // Autorisée même sur une saison ARCHIVED (pas de verrou — comportement
  // documenté, une correction sur une saison passée impacte les statistiques
  // déjà calculées, c'est l'effet attendu). `status` reste hors de portée de
  // cette route, voir UpdateSeasonDto.
  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateSeasonDto,
  ) {
    await this.findSeasonOrThrow(clubId, teamId, id);

    return this.prisma.season.update({
      where: { id },
      data: {
        name: dto.name,
        teamNameSnapshot: dto.teamNameSnapshot,
        categorySnapshot: dto.categorySnapshot,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
  }

  // Uniquement une saison DRAFT : une saison ACTIVE/ARCHIVED porte déjà de
  // l'historique (PlayerTeam, à terme Championship) qu'une suppression
  // romprait silencieusement.
  async remove(clubId: number, teamId: number, id: number) {
    const season = await this.findSeasonOrThrow(clubId, teamId, id);
    if (season.status !== 'DRAFT') {
      throw new AppException(
        'SEASONS.CANNOT_DELETE_NON_DRAFT',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.season.delete({ where: { id } });
  }

  private async findSeasonOrThrow(clubId: number, teamId: number, id: number) {
    const season = await this.prisma.season.findFirst({
      where: { id, teamId, team: { clubId } },
    });
    if (!season) {
      throw new AppException('SEASONS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return season;
  }
}
