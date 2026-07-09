import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerAbsenceDto } from './dto/create-player-absence.dto';
import { FindPlayerAbsencesQueryDto } from './dto/find-player-absences-query.dto';
import { UpdatePlayerAbsenceDto } from './dto/update-player-absence.dto';

export interface PlayerAbsenceRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Absences planifiées d'un joueur (docs/schema/joueurs.md §PlayerAbsence),
 * indépendantes de l'équipe — pas de modèle de visibilité, contrairement à
 * PlayerNote/PlayerObjective.
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_absence/ACTION dans ce club ?" — pas que le joueur ciblé par l'URL
 * est bien lui-même, ni qu'il appartient à l'équipe transmise en query. Pour
 * le scope OWN (Player), ce service compare le `memberId` du joueur visé à
 * celui de l'appelant ; pour le scope TEAM (Coach), il vérifie
 * l'appartenance à l'équipe via `assertPlayerInTeam` (docs/modules/
 * auth-roles.md §Patterns découverts).
 */
@Injectable()
export class PlayerAbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    reportedByMemberId: number,
    dto: CreatePlayerAbsenceDto,
    requester: PlayerAbsenceRequestContext,
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_ABSENCES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerAbsence.create({
      data: {
        playerId,
        reportedById: reportedByMemberId,
        reason: dto.reason,
        description: dto.description,
        startDate: dto.startDate,
        endDate: dto.endDate,
        // Scope OWN (un joueur qui déclare sa propre absence) : seul
        // l'entraîneur décide si elle est justifiée, jamais le joueur
        // lui-même — ignoré même si transmis explicitement dans le corps
        // de la requête.
        isExcused: requester.scope === 'OWN' ? null : dto.isExcused,
      },
      include: { reportedBy: true },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerAbsenceRequestContext,
    query: FindPlayerAbsencesQueryDto = {},
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_ABSENCES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerAbsence.findMany({
      where: {
        playerId,
        // Borne startDate — même champ que le tri (même convention que
        // PlayerObjective).
        startDate: { gte: query.dateFrom, lte: query.dateTo },
      },
      include: { reportedBy: true },
      orderBy: { startDate: query.sortOrder ?? 'desc' },
    });
  }

  async update(
    clubId: number,
    playerId: number,
    id: number,
    dto: UpdatePlayerAbsenceDto,
    requester: PlayerAbsenceRequestContext,
  ) {
    await this.findAbsenceOrThrow(clubId, playerId, id, requester);

    return this.prisma.playerAbsence.update({
      where: { id },
      data: {
        reason: dto.reason,
        description: dto.description,
        startDate: dto.startDate,
        endDate: dto.endDate,
        isExcused: dto.isExcused,
      },
      include: { reportedBy: true },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerAbsenceRequestContext,
  ) {
    await this.findAbsenceOrThrow(clubId, playerId, id, requester);
    await this.prisma.playerAbsence.delete({ where: { id } });
  }

  private async findAbsenceOrThrow(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerAbsenceRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_ABSENCES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const absence = await this.prisma.playerAbsence.findFirst({
      where: { id, playerId },
    });
    if (!absence) {
      throw new AppException('PLAYER_ABSENCES.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return absence;
  }
}
