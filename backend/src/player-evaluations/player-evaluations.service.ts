import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertParentChildLink } from '../common/parent-child-membership';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { resolveSeasonPeriod } from '../common/season-period';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerEvaluationDto } from './dto/create-player-evaluation.dto';
import { FindPlayerEvaluationsQueryDto } from './dto/find-player-evaluations-query.dto';
import { UpdatePlayerEvaluationDto } from './dto/update-player-evaluation.dto';

export interface PlayerEvaluationRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

const EVALUATION_INCLUDE = {
  scores: { include: { criterion: { include: { category: true } } } },
  evaluator: true,
} as const;

/**
 * Une évaluation = une session où le coach note TOUS les critères actifs du
 * club en une fois (docs/schema/joueurs.md) — pas une ligne par critère.
 * Contrairement à PlayerMeasurement, pas de contrainte append-only : UPDATE
 * est autorisé pour corriger un score ou un commentaire (remplace
 * intégralement les scores de la session).
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_evaluation/ACTION dans ce club ?" — pas que le joueur ciblé par
 * l'URL est bien lui-même, ni qu'il appartient à l'équipe transmise en
 * query. Pour le scope OWN (Player), ce service compare le `memberId` du
 * joueur visé à celui de l'appelant ; pour le scope TEAM (Coach), il
 * vérifie l'appartenance à l'équipe via `assertPlayerInTeam`
 * (docs/modules/auth-roles.md §Patterns découverts).
 */
@Injectable()
export class PlayerEvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    evaluatorMemberId: number,
    dto: CreatePlayerEvaluationDto,
    requester: PlayerEvaluationRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_EVALUATIONS.PLAYER_NOT_IN_CLUB',
    );
    await this.assertCriteriaInClub(
      clubId,
      dto.scores.map((s) => s.criterionId),
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerEvaluation.create({
      data: {
        playerId,
        evaluatorId: evaluatorMemberId,
        date: dto.date,
        comments: dto.comments,
        scores: {
          create: dto.scores.map((s) => ({
            criterionId: s.criterionId,
            score: s.score,
          })),
        },
      },
      include: EVALUATION_INCLUDE,
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerEvaluationRequestContext,
    query: FindPlayerEvaluationsQueryDto = {},
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_EVALUATIONS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }
    if (
      requester.scope === 'PARENT' &&
      player.memberId !== requester.memberId
    ) {
      await assertParentChildLink(
        this.prisma,
        requester.memberId,
        player.memberId,
        'PLAYER_EVALUATIONS.PLAYER_NOT_IN_CLUB',
      );
    }

    // Filtrage rétroactif par saison (A12) : prioritaire sur dateFrom/dateTo
    // si transmis — mutuellement exclusifs au niveau UI (voir DTO).
    let dateFrom = query.dateFrom;
    let dateTo = query.dateTo;
    if (query.seasonId) {
      const period = await resolveSeasonPeriod(
        this.prisma,
        clubId,
        query.seasonId,
        'PLAYER_EVALUATIONS.SEASON_NOT_FOUND',
      );
      dateFrom = period.startDate;
      dateTo = period.endDate;
    }

    return this.prisma.playerEvaluation.findMany({
      where: {
        playerId,
        date: { gte: dateFrom, lte: dateTo },
      },
      include: EVALUATION_INCLUDE,
      orderBy: { date: query.sortOrder ?? 'desc' },
    });
  }

  async update(
    clubId: number,
    playerId: number,
    id: number,
    dto: UpdatePlayerEvaluationDto,
    requester: PlayerEvaluationRequestContext,
  ) {
    await this.findEvaluationOrThrow(clubId, playerId, id, requester);
    if (dto.scores !== undefined) {
      await this.assertCriteriaInClub(
        clubId,
        dto.scores.map((s) => s.criterionId),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.scores !== undefined) {
        await tx.playerEvaluationScore.deleteMany({
          where: { evaluationId: id },
        });
      }
      return tx.playerEvaluation.update({
        where: { id },
        data: {
          date: dto.date,
          comments: dto.comments,
          ...(dto.scores !== undefined
            ? {
                scores: {
                  create: dto.scores.map((s) => ({
                    criterionId: s.criterionId,
                    score: s.score,
                  })),
                },
              }
            : {}),
        },
        include: EVALUATION_INCLUDE,
      });
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerEvaluationRequestContext,
  ) {
    await this.findEvaluationOrThrow(clubId, playerId, id, requester);
    // onDelete: Cascade sur PlayerEvaluationScore.evaluation — pas de
    // suppression manuelle des scores nécessaire.
    await this.prisma.playerEvaluation.delete({ where: { id } });
  }

  private async findEvaluationOrThrow(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerEvaluationRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_EVALUATIONS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const evaluation = await this.prisma.playerEvaluation.findFirst({
      where: { id, playerId },
    });
    if (!evaluation) {
      throw new AppException(
        'PLAYER_EVALUATIONS.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return evaluation;
  }

  // Un critère est utilisable pour ce club s'il est système (clubId null)
  // ou custom pour ce club précis — empêche de noter un joueur sur un
  // critère personnalisé appartenant à un autre club. Vérifie l'ensemble des
  // critères soumis en une fois (une évaluation note plusieurs critères).
  private async assertCriteriaInClub(clubId: number, criterionIds: number[]) {
    const uniqueIds = [...new Set(criterionIds)];
    const count = await this.prisma.evaluationCriterion.count({
      where: { id: { in: uniqueIds }, OR: [{ clubId: null }, { clubId }] },
    });
    if (count !== uniqueIds.length) {
      throw new AppException(
        'PLAYER_EVALUATIONS.CRITERION_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
