import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerObjectiveDto } from './dto/create-player-objective.dto';
import { FindPlayerObjectivesQueryDto } from './dto/find-player-objectives-query.dto';
import { UpdatePlayerObjectiveDto } from './dto/update-player-objective.dto';

export interface PlayerObjectiveRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Objectifs de développement d'un joueur (docs/schema/joueurs.md), même
 * modèle de visibilité Privé/Semi-privé/Public que PlayerNote — mais défaut
 * SEMI_PRIVE au lieu de PRIVE (docs/modules/effectif-joueurs.md).
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_objective/ACTION dans ce club ?" — pas que le joueur ciblé par
 * l'URL est bien lui-même, ni qu'il appartient à l'équipe transmise en
 * query. Pour le scope OWN (Player), ce service compare le `memberId` du
 * joueur visé à celui de l'appelant et filtre les objectifs PRIVE ; pour le
 * scope TEAM (Coach), il vérifie l'appartenance à l'équipe via
 * `assertPlayerInTeam` (docs/modules/auth-roles.md §Patterns découverts).
 */
@Injectable()
export class PlayerObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    assignedByMemberId: number,
    dto: CreatePlayerObjectiveDto,
    requester: PlayerObjectiveRequestContext,
  ) {
    await this.assertPlayerInClub(clubId, playerId);
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerObjective.create({
      data: {
        playerId,
        assignedById: assignedByMemberId,
        theme: dto.theme,
        description: dto.description,
        horizon: dto.horizon,
        status: dto.status,
        visibility: dto.visibility,
        startDate: dto.startDate,
        dueDate: dto.dueDate,
        completedDate: dto.completedDate,
      },
      include: { assignedBy: true },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerObjectiveRequestContext,
    query: FindPlayerObjectivesQueryDto = {},
  ) {
    const player = await this.assertPlayerInClub(clubId, playerId);
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const objectives = await this.prisma.playerObjective.findMany({
      where: {
        playerId,
        status: query.status,
        theme: query.theme,
        // Borne startDate — même champ que le tri (décision du 2026-07-06).
        // Un objectif sans startDate (NULL) ne peut satisfaire aucune borne
        // en SQL : il sort naturellement des résultats dès qu'un filtre de
        // date est actif, sans traitement particulier à ajouter ici.
        startDate: { gte: query.dateFrom, lte: query.dateTo },
      },
      include: { assignedBy: true },
      // Tri sur startDate (décision du 2026-07-06) plutôt que createdAt : la
      // date de début est ce qui a un sens pour l'utilisateur, pas quand la
      // fiche a été saisie. startDate est nullable (objectif pas encore
      // planifié) — nulls toujours en dernier, quel que soit le sens du tri,
      // pour qu'un objectif sans date ne remonte jamais artificiellement en
      // tête de liste (comportement par défaut de Postgres en DESC).
      orderBy: {
        startDate: { sort: query.sortOrder ?? 'desc', nulls: 'last' },
      },
    });

    if (requester.scope !== 'OWN') return objectives;

    // Un Player ne voit jamais les objectifs PRIVE (staff uniquement) — même
    // tension RGPD Article 15 que pour PlayerNote.
    return objectives.filter((objective) => objective.visibility !== 'PRIVE');
  }

  async update(
    clubId: number,
    playerId: number,
    id: number,
    dto: UpdatePlayerObjectiveDto,
    requester: PlayerObjectiveRequestContext,
  ) {
    await this.findObjectiveOrThrow(clubId, playerId, id, requester);

    return this.prisma.playerObjective.update({
      where: { id },
      data: {
        theme: dto.theme,
        description: dto.description,
        horizon: dto.horizon,
        status: dto.status,
        visibility: dto.visibility,
        startDate: dto.startDate,
        dueDate: dto.dueDate,
        completedDate: dto.completedDate,
      },
      include: { assignedBy: true },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerObjectiveRequestContext,
  ) {
    await this.findObjectiveOrThrow(clubId, playerId, id, requester);
    await this.prisma.playerObjective.delete({ where: { id } });
  }

  private async findObjectiveOrThrow(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerObjectiveRequestContext,
  ) {
    await this.assertPlayerInClub(clubId, playerId);
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const objective = await this.prisma.playerObjective.findFirst({
      where: { id, playerId },
    });
    if (!objective) {
      throw new AppException(
        'PLAYER_OBJECTIVES.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return objective;
  }

  private async assertPlayerInClub(clubId: number, playerId: number) {
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, member: { clubId } },
    });
    if (!player) {
      throw new AppException(
        'PLAYER_OBJECTIVES.PLAYER_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
    return player;
  }
}
