import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { resolveSeasonPeriod } from '../common/season-period';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerInterviewDto } from './dto/create-player-interview.dto';
import { FindPlayerInterviewsQueryDto } from './dto/find-player-interviews-query.dto';
import { UpdatePlayerInterviewDto } from './dto/update-player-interview.dto';

export interface PlayerInterviewRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Entretiens individuels joueur-staff (docs/schema/joueurs.md).
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_interview/ACTION dans ce club ?" — pas que le joueur ciblé par
 * l'URL est bien lui-même. Pour le scope OWN (Player), c'est ce service qui
 * compare le `memberId` du joueur visé à celui de l'appelant ; pour le scope
 * TEAM (Coach), il vérifie que le joueur appartient bien à l'équipe transmise
 * en query (même pattern que PlayerMeasurementsService, docs/modules/auth-roles.md).
 */
@Injectable()
export class PlayerInterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    staffMemberId: number,
    dto: CreatePlayerInterviewDto,
    requester: PlayerInterviewRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_INTERVIEWS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerInterview.create({
      data: {
        playerId,
        staffId: staffMemberId,
        date: dto.date,
        subject: dto.subject,
        summary: dto.summary,
        staffFeedback: dto.staffFeedback,
        staffAssessment: dto.staffAssessment,
        playerFeedback: dto.playerFeedback,
      },
      include: { staff: true },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerInterviewRequestContext,
    query: FindPlayerInterviewsQueryDto = {},
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_INTERVIEWS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const isOwnScope = requester.scope === 'OWN';

    // Filtrage rétroactif par saison (A12) : prioritaire sur dateFrom/dateTo
    // si transmis — mutuellement exclusifs au niveau UI (voir DTO).
    let dateFrom = query.dateFrom;
    let seasonDateTo = query.dateTo;
    if (query.seasonId) {
      const period = await resolveSeasonPeriod(
        this.prisma,
        clubId,
        query.seasonId,
        'PLAYER_INTERVIEWS.SEASON_NOT_FOUND',
      );
      dateFrom = period.startDate;
      seasonDateTo = period.endDate;
    }

    // Un Player (scope OWN) ne voit jamais les entretiens à venir — seulement
    // ceux déjà passés (décision du 2026-07-06). "Aujourd'hui" compte comme
    // passé : borne haute fixée à la fin de la journée courante.
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const dateTo =
      isOwnScope && (!seasonDateTo || seasonDateTo > endOfToday)
        ? endOfToday
        : seasonDateTo;

    const interviews = await this.prisma.playerInterview.findMany({
      where: {
        playerId,
        date: { gte: dateFrom, lte: dateTo },
      },
      include: { staff: true },
      orderBy: { date: query.sortOrder ?? 'desc' },
    });

    if (!isOwnScope) return interviews;

    // staffAssessment est le ressenti/évaluation interne de l'encadrant :
    // jamais transmis à un appelant en scope OWN (voir le commentaire sur le
    // modèle PlayerInterview dans schema.prisma).
    return interviews.map(
      ({ staffAssessment: _staffAssessment, ...rest }) => rest,
    );
  }

  async update(
    clubId: number,
    playerId: number,
    id: number,
    dto: UpdatePlayerInterviewDto,
    requester: PlayerInterviewRequestContext,
  ) {
    await this.findInterviewOrThrow(clubId, playerId, id, requester);

    return this.prisma.playerInterview.update({
      where: { id },
      data: {
        date: dto.date,
        subject: dto.subject,
        summary: dto.summary,
        staffFeedback: dto.staffFeedback,
        staffAssessment: dto.staffAssessment,
        playerFeedback: dto.playerFeedback,
      },
      include: { staff: true },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerInterviewRequestContext,
  ) {
    await this.findInterviewOrThrow(clubId, playerId, id, requester);
    await this.prisma.playerInterview.delete({ where: { id } });
  }

  private async findInterviewOrThrow(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerInterviewRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_INTERVIEWS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const interview = await this.prisma.playerInterview.findFirst({
      where: { id, playerId },
    });
    if (!interview) {
      throw new AppException(
        'PLAYER_INTERVIEWS.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return interview;
  }
}
