import { HttpStatus, Injectable } from '@nestjs/common';
import type { Season, SeasonStatus } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { FindSeasonsQueryDto } from './dto/find-seasons-query.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

// Ordre d'affichage de la liste des saisons (docs/modules/
// saisons-championnats.md) : ACTIVE en premier, ARCHIVED en dernier — un
// ordre de priorité, pas alphabétique, donc pas exprimable en un simple
// `orderBy` Prisma sur la colonne status. Résolu ici (backend), jamais en JS
// côté frontend (convention du projet — tri toujours résolu côté backend).
const STATUS_DISPLAY_ORDER: Record<SeasonStatus, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  ARCHIVED: 2,
};

/**
 * CRUD des saisons (docs/schema/championnats.md — Season), scopé CLUB depuis
 * la révision A14 (docs/roadmap.md) : toutes les équipes d'un club partagent
 * le même calendrier de saisons. L'URL ne porte que clubId — pas de
 * contournement `?teamId=` nécessaire ici, la ressource n'a jamais de
 * `teamId` (contrairement aux ressources scopées joueur, voir
 * docs/modules/auth-roles.md §Patterns découverts).
 *
 * Pas de logique de roster : `PlayerTeam` n'a pas de FK directe vers
 * `Season`, les mouvements de joueurs entre équipes se gèrent au fil de l'eau
 * via l'Effectif, jamais via un wizard de transition de saison.
 */
@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  // Toujours créée en DRAFT (CreateSeasonDto n'expose pas `status`) — la
  // saison précédente reste ACTIVE tant que celle-ci n'est pas activée.
  async create(clubId: number, dto: CreateSeasonDto) {
    await this.assertNoOverlap(clubId, dto.startDate, dto.endDate);

    return this.prisma.season.create({
      data: {
        clubId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: 'DRAFT',
      },
    });
  }

  async findAllByClub(clubId: number, query: FindSeasonsQueryDto = {}) {
    const seasons = await this.prisma.season.findMany({
      where: { clubId, status: query.status },
      orderBy: { startDate: 'desc' },
    });

    // Array.prototype.sort est stable (garanti depuis ES2019) : l'ordre par
    // startDate desc posé par Prisma est préservé au sein de chaque groupe
    // de statut.
    return [...seasons].sort(
      (a, b) => STATUS_DISPLAY_ORDER[a.status] - STATUS_DISPLAY_ORDER[b.status],
    );
  }

  async findOne(clubId: number, id: number) {
    return this.findSeasonOrThrow(clubId, id);
  }

  // Autorisée même sur une saison ARCHIVED (pas de verrou — comportement
  // documenté, une correction sur une saison passée impacte les statistiques
  // déjà calculées, c'est l'effet attendu). `status` reste hors de portée de
  // cette route, voir UpdateSeasonDto.
  async update(clubId: number, id: number, dto: UpdateSeasonDto) {
    const season = await this.findSeasonOrThrow(clubId, id);

    if (dto.startDate || dto.endDate) {
      await this.assertNoOverlap(
        clubId,
        dto.startDate ?? season.startDate,
        dto.endDate ?? season.endDate,
        id,
      );
    }

    return this.prisma.season.update({
      where: { id },
      data: {
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
  }

  // Uniquement une saison DRAFT : une saison ACTIVE/ARCHIVED porte déjà de
  // l'historique (PlayerTeam, à terme Championship) qu'une suppression
  // romprait silencieusement.
  async remove(clubId: number, id: number) {
    const season = await this.findSeasonOrThrow(clubId, id);
    if (season.status !== 'DRAFT') {
      throw new AppException(
        'SEASONS.CANNOT_DELETE_NON_DRAFT',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.season.delete({ where: { id } });
  }

  /**
   * Action ponctuelle (bouton + confirmation, plus de wizard) : archive
   * l'ancienne saison ACTIVE du club (s'il y en a une, `endDate`
   * éventuellement corrigée) et active la nouvelle. Aucune transaction sur
   * `PlayerTeam` — décision A14, les mouvements de joueurs sont découplés de
   * la saison elle-même.
   */
  async activate(
    clubId: number,
    id: number,
    oldSeasonEndDateOverride?: Date,
  ): Promise<Season> {
    const newSeason = await this.findSeasonOrThrow(clubId, id);
    if (newSeason.status !== 'DRAFT') {
      throw new AppException(
        'SEASONS.ACTIVATION_ONLY_FOR_DRAFT',
        HttpStatus.CONFLICT,
      );
    }

    const oldSeason = await this.prisma.season.findFirst({
      where: { clubId, status: 'ACTIVE' },
    });

    if (oldSeason && oldSeasonEndDateOverride) {
      await this.assertNoOverlap(
        clubId,
        oldSeason.startDate,
        oldSeasonEndDateOverride,
        oldSeason.id,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (oldSeason) {
        const finalEndDate = oldSeasonEndDateOverride ?? oldSeason.endDate;
        await tx.season.update({
          where: { id: oldSeason.id },
          data: { status: 'ARCHIVED', endDate: finalEndDate },
        });
      }

      await tx.season.update({
        where: { id: newSeason.id },
        data: { status: 'ACTIVE' },
      });
    });

    // Assertion défensive : l'opération ci-dessus est atomique et garantit ce
    // résultat par construction — un écart ici signalerait une incohérence
    // de données préexistante, pas un bug de cette méthode.
    const activeCount = await this.prisma.season.count({
      where: { clubId, status: 'ACTIVE' },
    });
    if (activeCount !== 1) {
      throw new AppException(
        'SEASONS.MULTIPLE_ACTIVE_SEASONS',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.season.findUniqueOrThrow({
      where: { id: newSeason.id },
    });
  }

  private async findSeasonOrThrow(clubId: number, id: number) {
    const season = await this.prisma.season.findFirst({
      where: { id, clubId },
    });
    if (!season) {
      throw new AppException('SEASONS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return season;
  }

  // Deux Season d'un même club ne peuvent jamais avoir de plages de dates
  // qui se chevauchent (règle explicitement demandée, docs/roadmap.md
  // révision A14) — vérifiée à la création, à toute modification des dates,
  // et à l'activation si `oldSeasonEndDate` est corrigée. Indépendant du
  // `status` : une saison ARCHIVED garde des dates historiques qui ne
  // doivent pas non plus chevaucher une nouvelle saison.
  private async assertNoOverlap(
    clubId: number,
    startDate: Date,
    endDate: Date,
    excludeSeasonId?: number,
  ) {
    const overlapping = await this.prisma.season.findFirst({
      where: {
        clubId,
        id: excludeSeasonId ? { not: excludeSeasonId } : undefined,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw new AppException(
        'SEASONS.OVERLAPPING_DATE_RANGE',
        HttpStatus.CONFLICT,
      );
    }
  }
}
